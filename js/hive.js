console.log("HIVE JS LOADED FROM FRONTEND");
function hiveTransfer(from, to, amount, memo, currency = "HIVE") {
  if (!window.hive_keychain) {
    alert("Hive Keychain not found");
    return;
  }

  window.hive_keychain.requestTransfer(
    from,
    to,
    amount,
    memo,
    currency,
    function (response) {
      console.log("Keychain response:", response);

      if (response.success) {
        console.log("✅ Transfer approved");
      } else {
        console.log("❌ Transfer cancelled or failed");
      }
    }
  );
}

// Make it globally accessible
window.hiveTransfer = hiveTransfer;