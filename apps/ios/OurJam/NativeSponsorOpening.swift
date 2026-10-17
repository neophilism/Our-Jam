import SwiftUI
import AVFoundation
import UIKit

struct NativeSponsorOpening: View {
    let opening: EventState.SponsorOpening
    let remaining: Int
    let elapsed: Double
    let origin: String
    private var position: (EventState.SponsorOpening.Clip, Double)? {
        let cycle = opening.clips.reduce(0) { $0 + max(0, $1.slotSeconds) }
        guard cycle > 0 else { return nil }
        let point = elapsed.truncatingRemainder(dividingBy: cycle)
        var edge = 0.0
        for clip in opening.clips {
            let start = edge; edge += max(0, clip.slotSeconds)
            if point >= start && point < edge { return (clip, point - start) }
        }
        return nil
    }
    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                if let (clip, offset) = position, UUID(uuidString: clip.id) != nil, let url = URL(string: origin + "/api/sponsor-videos/" + clip.id) {
                    SilentSponsorVideo(url: url, paused: opening.paused, offset: offset)
                        .frame(height: 190).clipped().accessibilityHidden(true)
                    Text("Sponsored by " + clip.sponsorName).font(.caption)
                }
                Text("Our Jam begins in \(remaining)s").font(.title2.bold().monospacedDigit()).accessibilityIdentifier("sponsorCountdown")
                Text(opening.paused ? "Countdown paused with the music." : "The music continues. Get your next Sound Wave ready.").font(.callout)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// No playback controls and no application credential headers. Published video
// redirects use short-lived media URLs; video failures never stop the countdown.
private struct SilentSponsorVideo: UIViewRepresentable {
    let url: URL
    let paused: Bool
    let offset: Double
    final class Surface: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var videoLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
    final class Coordinator {
        let player = AVPlayer()
        var url: URL?
        var paused = false
        var ended: NSObjectProtocol?
        init() { player.isMuted = true; player.volume = 0 }
        func stop() {
            player.pause(); player.replaceCurrentItem(with: nil)
            if let ended { NotificationCenter.default.removeObserver(ended) }
            ended = nil
        }
        func update(url: URL, paused: Bool, offset: Double) {
            self.paused = paused
            if self.url != url {
                stop(); self.url = url
                let item = AVPlayerItem(url: url)
                player.replaceCurrentItem(with: item)
                ended = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
                    guard let self else { return }
                    self.player.seek(to: .zero)
                    if !self.paused { self.player.play() }
                }
            }
            player.isMuted = true; player.volume = 0
            let duration = player.currentItem?.duration.seconds ?? 0
            let target = duration.isFinite && duration > 0 ? offset.truncatingRemainder(dividingBy: duration) : offset
            let current = player.currentTime().seconds
            if !current.isFinite || abs(current - target) > 1.5 {
                player.seek(to: CMTime(seconds: max(0, target), preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
            }
            if paused { player.pause() } else { player.play() }
        }
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> Surface {
        let view = Surface(); view.backgroundColor = .black
        view.videoLayer.player = context.coordinator.player
        view.videoLayer.videoGravity = .resizeAspect
        return view
    }
    func updateUIView(_ view: Surface, context: Context) { context.coordinator.update(url: url, paused: paused, offset: offset) }
    static func dismantleUIView(_ view: Surface, coordinator: Coordinator) { coordinator.stop(); view.videoLayer.player = nil }
}
