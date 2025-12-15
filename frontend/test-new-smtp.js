const nodemailer = require('nodemailer');

// 🔐 GANTI DENGAN APP PASSWORD BARU ANDA
const NEW_PASSWORD = "password-baru-anda-disini";

console.log('🧪 Testing NEW App Password...');
console.log('📧 From: fairy669@gmail.com');
console.log('📨 To: vicaguneven@gmail.com');
console.log('🔐 Password:', NEW_PASSWORD ? '***' + NEW_PASSWORD.slice(-4) : 'NOT SET');
console.log('---');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'fairy669@gmail.com',
    pass: NEW_PASSWORD
  }
});

async function test() {
  try {
    console.log('🔗 Testing SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP Connection SUCCESS!');
    
    console.log('📤 Sending test email...');
    const result = await transporter.sendMail({
      from: 'fairy669@gmail.com',
      to: 'vicaguneven@gmail.com',
      subject: '🎉 TEST: SMTP Configuration Working! - ' + new Date().toLocaleString(),
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: green;">🎉 SMTP BERHASIL!</h2>
          <p>Email ini membuktikan SMTP Gmail bekerja dengan App Password baru.</p>
          <p><strong>Timestamp:</strong> ${new Date().toString()}</p>
          <p><strong>From:</strong> fairy669@gmail.com</p>
          <p><strong>To:</strong> vicaguneven@gmail.com</p>
          <hr>
          <p style="color: #666;">Jika Anda menerima email ini, sistem verifikasi email Web Scanner akan bekerja!</p>
        </div>
      `,
      text: `SMTP Test Successful - ${new Date().toString()}`
    });
    
    console.log('✅ Test email SENT successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📨 Response:', result.response);
    console.log('👀 Please check INBOX and SPAM folder of: vicaguneven@gmail.com');
    
    return true;
  } catch (error) {
    console.log('❌ SMTP FAILED:');
    console.log('   Error:', error.message);
    console.log('   Code:', error.code);
    console.log('   Response:', error.response);
    return false;
  }
}

test();
