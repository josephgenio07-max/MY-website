export function generateReceiptEmail(data: {
  playerName: string;
  teamName: string;
  amount: number;
  currency: string;
  paidAt: string;
  receiptNumber: string;
}) {
  const amountFormatted = (data.amount / 100).toFixed(2);
  const dateFormatted = new Date(data.paidAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return {
    subject: `Payment Receipt - ${data.teamName}`,
    text: `
Hi ${data.playerName},

Thank you for your payment!

Receipt #${data.receiptNumber}
Team: ${data.teamName}
Amount: £${amountFormatted}
Date: ${dateFormatted}

This is your payment confirmation.

Thanks,
${data.teamName}
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #111; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 30px; }
    .receipt-box { background: white; border: 2px solid #eee; padding: 20px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; margin: 10px 0; }
    .label { font-weight: bold; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Payment Receipt</h1>
    </div>
    <div class="content">
      <p>Hi ${data.playerName},</p>
      <p>Thank you for your payment!</p>
      
      <div class="receipt-box">
        <div class="row">
          <span class="label">Receipt #</span>
          <span>${data.receiptNumber}</span>
        </div>
        <div class="row">
          <span class="label">Team</span>
          <span>${data.teamName}</span>
        </div>
        <div class="row">
          <span class="label">Amount</span>
          <span><strong>£${amountFormatted}</strong></span>
        </div>
        <div class="row">
          <span class="label">Date</span>
          <span>${dateFormatted}</span>
        </div>
      </div>
      
      <p>This is your payment confirmation.</p>
      <p>Thanks,<br>${data.teamName}</p>
    </div>
    <div class="footer">
      <p>This is an automated receipt. Please keep for your records.</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  };
}