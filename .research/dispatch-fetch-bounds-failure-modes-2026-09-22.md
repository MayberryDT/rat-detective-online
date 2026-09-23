# Dispatch response-bound failure modes — before implementation

Candidate: standalone Omarchy plugin `MayberryDT/rat-detective-omarchy`,
baseline `36a56b14f9497170b0de49cb3ca9618b6e1864c6`.

The network response is untrusted. The limit must be enforced before QML's
`StdioCollector` receives any body. These are the cases the bounded producer
must survive:

1. A normal JSON response remains byte-for-byte compatible with the existing
   HTTP status/content-type trailer, and QML can still parse it.
2. A valid body exactly at the configured maximum is accepted; one byte over is
   rejected without forwarding partial body data.
3. An oversized body with `Content-Length`, and an oversized chunked body with
   no declared length, are both rejected while receiving—not after full read.
4. A large non-2xx body is rejected too; an error status is not permission to
   bypass the body cap.
5. Existing 404/501 legacy fallback and HTML fallback metadata remain intact.
6. A stalled or drip-fed response still ends within the existing five-second
   curl deadline; partial data is not emitted and the child is reaped.
7. Child stderr and helper error output stay bounded; a remote response cannot
   turn diagnostics into another collector exhaustion path.
8. Disabling/switching fixtures while the helper is active does not leave curl
   running; output from a cancelled request is never delivered to QML.

Verification will run the production helper as a subprocess against a local
HTTP fixture server, with deterministic assertions and a JSON result artifact.
