// Cypress global support — loaded before every spec.
//
// Foundry's frontend logs a tide of "uncaught" promise rejections at
// boot that aren't actually fatal (Howler audio context warnings, sync
// websocket bootstrap, etc.). They'd otherwise fail Cypress runs even
// though Foundry is working fine. Swallow them — the actual assertion
// (Quench failure count === 0) is the real signal.
Cypress.on("uncaught:exception", (err) => {
  // eslint-disable-next-line no-console
  console.warn("[uncaught:exception swallowed]", err?.message ?? err);
  return false;
});
