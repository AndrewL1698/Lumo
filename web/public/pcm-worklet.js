/* global AudioWorkletProcessor, registerProcessor */
// Mic capture for push-to-talk (web/lib/tutor/client/pttRecorder.ts).
// Posts every input block's channel 0 (Float32Array, 128 frames at the context rate) to the main thread.
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      const copy = ch.slice(0); // the engine reuses `ch`, so copy before posting
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true; // keep alive between presses
  }
}
registerProcessor("pcm-capture", PcmCapture);
