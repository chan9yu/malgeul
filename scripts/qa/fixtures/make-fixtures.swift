import AVFoundation
import Foundation

let dir = URL(fileURLWithPath: "/tmp/malgeul-check")
let width = 320
let height = 240
let fps: Int32 = 30
let seconds = 10

func makePixelBuffer(index: Int) -> CVPixelBuffer? {
	var out: CVPixelBuffer?
	CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, nil, &out)
	guard let buffer = out else { return nil }
	CVPixelBufferLockBaseAddress(buffer, [])
	if let base = CVPixelBufferGetBaseAddress(buffer) {
		let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
		let ptr = base.assumingMemoryBound(to: UInt8.self)
		let moving = UInt8((index * 7) % 256)
		for y in 0..<height {
			for x in 0..<width {
				let offset = y * bytesPerRow + x * 4
				ptr[offset] = moving
				ptr[offset + 1] = UInt8((x * 255) / width)
				ptr[offset + 2] = UInt8((y * 255) / height)
				ptr[offset + 3] = 255
			}
		}
	}
	CVPixelBufferUnlockBaseAddress(buffer, [])
	return buffer
}

func writeVideoOnly(to url: URL) {
	try? FileManager.default.removeItem(at: url)
	guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else {
		print("writer 생성 실패")
		return
	}
	let settings: [String: Any] = [
		AVVideoCodecKey: AVVideoCodecType.h264,
		AVVideoWidthKey: width,
		AVVideoHeightKey: height
	]
	let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
	input.expectsMediaDataInRealTime = false
	let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
	writer.add(input)
	writer.startWriting()
	writer.startSession(atSourceTime: .zero)

	for index in 0..<(Int(fps) * seconds) {
		while !input.isReadyForMoreMediaData { usleep(500) }
		guard let buffer = makePixelBuffer(index: index) else { continue }
		adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: fps))
	}

	input.markAsFinished()
	let done = DispatchSemaphore(value: 0)
	writer.finishWriting { done.signal() }
	done.wait()
	print("no-audio.mp4 status=\(writer.status.rawValue)")
}

func combine(audio: URL, output: URL, fileType: AVFileType) {
	try? FileManager.default.removeItem(at: output)
	let videoAsset = AVURLAsset(url: dir.appendingPathComponent("no-audio.mp4"))
	let audioAsset = AVURLAsset(url: audio)
	let composition = AVMutableComposition()

	guard let videoTrack = videoAsset.tracks(withMediaType: .video).first,
		let audioTrack = audioAsset.tracks(withMediaType: .audio).first,
		let videoSlot = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
		let audioSlot = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
	else {
		print("트랙 준비 실패 \(output.lastPathComponent)")
		return
	}

	let span = CMTimeRange(start: .zero, duration: min(videoAsset.duration, audioAsset.duration))
	try? videoSlot.insertTimeRange(span, of: videoTrack, at: .zero)
	try? audioSlot.insertTimeRange(span, of: audioTrack, at: .zero)

	guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
		print("export 생성 실패")
		return
	}
	export.outputURL = output
	export.outputFileType = fileType
	let done = DispatchSemaphore(value: 0)
	export.exportAsynchronously { done.signal() }
	done.wait()
	print("\(output.lastPathComponent) status=\(export.status.rawValue) error=\(export.error.map { String(describing: $0) } ?? "없음")")
}

writeVideoOnly(to: dir.appendingPathComponent("no-audio.mp4"))
combine(audio: dir.appendingPathComponent("speech.m4a"), output: dir.appendingPathComponent("speech-mono.mp4"), fileType: .mp4)
combine(audio: dir.appendingPathComponent("speech-stereo.m4a"), output: dir.appendingPathComponent("speech-stereo.mov"), fileType: .mov)
