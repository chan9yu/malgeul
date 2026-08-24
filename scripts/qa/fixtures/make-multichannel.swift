// 모노 오디오를 여러 채널로 펼치되 지정한 채널에만 소리를 넣는다.
// Web Audio 는 1, 2, 4, 6 채널만 다운믹스 규칙을 정하고 그 밖은 discrete 로 취급해 앞 채널만 남긴다.
// 첫 채널이 비어 있고 다른 채널에 목소리가 있는 파일이라야 그 결함이 드러난다.
//
// 사용법: swift make-multichannel.swift <입력.aiff> <출력.caf> [소리를 넣을 채널]

import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
	print("사용법: make-multichannel.swift <입력> <출력> [채널]")
	exit(1)
}

let source = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
let voiceChannel = args.count > 3 ? Int(args[3]) ?? 1 : 1
let channelCount: AVAudioChannelCount = 8

let inFile = try AVAudioFile(forReading: source)
guard let mono = AVAudioPCMBuffer(pcmFormat: inFile.processingFormat, frameCapacity: AVAudioFrameCount(inFile.length))
else {
	fatalError("입력 버퍼를 만들지 못했다")
}
try inFile.read(into: mono)

guard let layout = AVAudioChannelLayout(layoutTag: kAudioChannelLayoutTag_AudioUnit_7_1) else {
	fatalError("채널 레이아웃을 만들지 못했다")
}
let outFormat = AVAudioFormat(
	commonFormat: .pcmFormatFloat32,
	sampleRate: inFile.processingFormat.sampleRate,
	interleaved: false,
	channelLayout: layout
)
guard outFormat.channelCount == channelCount,
	let wide = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: mono.frameLength)
else {
	fatalError("출력 버퍼를 만들지 못했다")
}
wide.frameLength = mono.frameLength

guard let src = mono.floatChannelData, let dst = wide.floatChannelData else {
	fatalError("채널 데이터가 없다")
}
for channel in 0..<Int(channelCount) {
	if channel == voiceChannel {
		dst[channel].update(from: src[0], count: Int(mono.frameLength))
	} else {
		dst[channel].update(repeating: 0, count: Int(mono.frameLength))
	}
}

try? FileManager.default.removeItem(at: output)
let settings: [String: Any] = [
	AVFormatIDKey: kAudioFormatLinearPCM,
	AVSampleRateKey: outFormat.sampleRate,
	AVNumberOfChannelsKey: Int(channelCount),
	AVChannelLayoutKey: Data(bytes: layout.layout, count: MemoryLayout<AudioChannelLayout>.size),
	AVLinearPCMBitDepthKey: 16,
	AVLinearPCMIsFloatKey: false,
	AVLinearPCMIsBigEndianKey: false,
	AVLinearPCMIsNonInterleaved: false
]
let outFile = try AVAudioFile(
	forWriting: output,
	settings: settings,
	commonFormat: .pcmFormatFloat32,
	interleaved: false
)
try outFile.write(from: wide)
print("\(channelCount)채널 작성. 소리는 채널 \(voiceChannel), 프레임 \(wide.frameLength)")
