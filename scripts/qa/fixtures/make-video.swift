// 영상 트랙을 만들어 주어진 오디오와 합친다.
// Passthrough 로 내보내므로 오디오의 채널 수와 코덱이 그대로 남는다. 재인코딩하면 8채널이 스테레오가 된다.
//
// 사용법: swift make-video.swift <오디오> <출력> <mp4|mov> [목표 바이트]
//
// 목표 바이트를 주면 그 크기에 닿도록 고비트레이트로 길게 쓴다. 크기 제한 경계를 확인할 때 쓴다.
// 비압축 코덱은 AVAssetWriter 가 픽셀 버퍼로 받지 않아 H.264 의 비트레이트를 올리는 방식을 쓴다.

import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 4 else {
	print("사용법: make-video.swift <오디오> <출력> <mp4|mov> [목표 바이트]")
	exit(1)
}

let audioURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])
let fileType: AVFileType = args[3] == "mov" ? .mov : .mp4
let targetBytes = args.count > 4 ? Int(args[4]) : nil

let audioAsset = AVURLAsset(url: audioURL)
let audioSeconds = CMTimeGetSeconds(audioAsset.duration)

let fps: Int32 = 5
let width = targetBytes == nil ? 640 : 1920
let height = targetBytes == nil ? 360 : 1080
let bitsPerSecond = 320_000_000
let frameCount: Int = {
	guard let bytes = targetBytes else {
		return max(1, Int(ceil(audioSeconds)) * Int(fps))
	}
	return max(1, Int(Double(bytes) * 8.0 / Double(bitsPerSecond) * Double(fps)))
}()

func makePixelBuffer(index: Int) -> CVPixelBuffer? {
	var out: CVPixelBuffer?
	CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, nil, &out)
	guard let buffer = out else { return nil }
	CVPixelBufferLockBaseAddress(buffer, [])
	defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
	guard let base = CVPixelBufferGetBaseAddress(buffer) else { return buffer }

	let size = CVPixelBufferGetDataSize(buffer)
	let ptr = base.assumingMemoryBound(to: UInt8.self)
	if targetBytes == nil {
		memset(base, Int32(40 + (index % 180)), size)
		return buffer
	}

	// 목표 크기를 채우려면 압축이 잘 안 되는 그림이 필요하다. 프레임마다 다른 잡음을 넣는다
	var seed = UInt32(truncatingIfNeeded: index &* 2_654_435_761) | 1
	for offset in 0..<size {
		seed ^= seed << 13
		seed ^= seed >> 17
		seed ^= seed << 5
		ptr[offset] = UInt8(truncatingIfNeeded: seed)
	}
	return buffer
}

let silent = outURL.deletingLastPathComponent().appendingPathComponent("__video-only.mov")
try? FileManager.default.removeItem(at: silent)
guard let writer = try? AVAssetWriter(outputURL: silent, fileType: .mov) else {
	fatalError("writer 를 만들지 못했다")
}

var settings: [String: Any] = [
	AVVideoCodecKey: AVVideoCodecType.h264,
	AVVideoWidthKey: width,
	AVVideoHeightKey: height
]
if targetBytes != nil {
	settings[AVVideoCompressionPropertiesKey] = [
		AVVideoAverageBitRateKey: bitsPerSecond,
		AVVideoMaxKeyFrameIntervalKey: 1,
		AVVideoAllowFrameReorderingKey: false
	]
}

let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

print("프레임 \(frameCount)개, \(width)x\(height)")
for index in 0..<frameCount {
	while !input.isReadyForMoreMediaData { usleep(500) }
	guard let buffer = makePixelBuffer(index: index) else { continue }
	adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: fps))
}
input.markAsFinished()
let wrote = DispatchSemaphore(value: 0)
writer.finishWriting { wrote.signal() }
wrote.wait()

guard writer.status == .completed else {
	fatalError("영상 쓰기 실패 status=\(writer.status.rawValue) \(writer.error.map { String(describing: $0) } ?? "")")
}

let videoAsset = AVURLAsset(url: silent)
let composition = AVMutableComposition()
guard let videoTrack = videoAsset.tracks(withMediaType: .video).first,
	let audioTrack = audioAsset.tracks(withMediaType: .audio).first,
	let videoSlot = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
	let audioSlot = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
else {
	fatalError("트랙을 준비하지 못했다")
}

let span = CMTimeRange(start: .zero, duration: min(videoAsset.duration, audioAsset.duration))
try videoSlot.insertTimeRange(span, of: videoTrack, at: .zero)
try audioSlot.insertTimeRange(span, of: audioTrack, at: .zero)

try? FileManager.default.removeItem(at: outURL)
guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
	fatalError("export 를 만들지 못했다")
}
export.outputURL = outURL
export.outputFileType = fileType
let done = DispatchSemaphore(value: 0)
export.exportAsynchronously { done.signal() }
done.wait()
try? FileManager.default.removeItem(at: silent)

let size = (try? FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as? Int) ?? nil
print("\(outURL.lastPathComponent) status=\(export.status.rawValue) 크기=\(size ?? 0) error=\(export.error.map { String(describing: $0) } ?? "없음")")
