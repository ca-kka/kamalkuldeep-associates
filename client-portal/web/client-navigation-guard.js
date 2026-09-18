/* Client portal navigation guard. Dedicated Documents and Upload modules handle their own routes. */
// Do not intercept these links here: doing so prevents the dedicated modules from receiving the click.
const dedicatedViews=new Set(["documents","upload"]);
window.KKADedicatedClientViews=dedicatedViews;
