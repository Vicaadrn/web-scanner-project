const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'fairy669@gmail.com',
    pass: 'dxgyxvjvbcrypgmx'
  }
});

console.log('Testing Gmail SMTP connection...');

transporter.verify(function(error, success) {
  if (error) {
    console.log('❌ SMTP Error:', error);
  } else {
    console.log('✅ SMTP Success: Server is ready to send emails');
    
    // Test send real email
    transporter.sendMail({
      from: 'fairy669@gmail.com',
      to: 'fairy669@gmail.com', // Ganti dengan email tujuan
      subject: 'TEST: Email Verification System',
      html: `
        <h2>Test Email dari Web Scanner</h2>
        <p>Jika Anda menerima email ini, sistem SMTP berhasil!</p>
        <a href="http://localhost:3000/api/auth/verify?token=test123">Verify Email</a>
      `
    }, (err, info) => {
      if (err) {
        console.log('❌ Send test email failed:', err);
      } else {
        console.log('✅ Test email sent successfully!');
        console.log('📧 Message ID:', info.messageId);
        console.log('👀 Check your email inbox!');
      }
    });
  }
});
