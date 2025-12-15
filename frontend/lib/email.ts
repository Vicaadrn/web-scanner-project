import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const createTransporter = () => {
  const port = parseInt(process.env.EMAIL_SERVER_PORT || '587');
  
  // Jika port 465, secure: true (SSL/TLS eksplisit).
  // Jika port 587 (atau lainnya), secure: false (StartTLS).
  const isSecure = port === 465; 

  return nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: port,
    secure: isSecure, 
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
    // 🔥 PENTING: Blok 'tls' ini membantu koneksi StartTLS (Port 587) di lingkungan lokal 
    // dengan mengabaikan otorisasi sertifikat yang sering gagal di localhost.
    //tls: {rejectUnauthorized: false}
  });
};

export const sendVerificationEmail = async (email: string, token: string) => {
  // Pastikan NEXTAUTH_URL diset di .env
  if (!process.env.NEXTAUTH_URL) {
      console.error("Kesalahan Konfigurasi: NEXTAUTH_URL tidak diset.");
      // Lanjutkan eksekusi tanpa melempar error
      return; 
  }
    
  const verificationUrl = `${process.env.NEXTAUTH_URL}/api/auth/verify?token=${token}`;

  // 🎯 Logika Hybrid: Selalu log ke konsol untuk keperluan debug
  console.log('\n🎯 ===== EMAIL VERIFICATION =====');
  console.log(`📧 To: ${email}`);
  console.log(`🔗 VERIFICATION URL: ${verificationUrl}`);
  console.log('📋 Quick command:');
  console.log(`   curl "${verificationUrl}"`);
  console.log('================================\n');

  // Simpan log ke file (seperti implementasi sebelumnya)
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logData = {
      email,
      verificationUrl,
      timestamp: new Date().toISOString(),
      token: token
    };
    fs.writeFileSync(
      path.join(logsDir, `verification-${Date.now()}.json`),
      JSON.stringify(logData, null, 2)
    );
  } catch (err) {
    console.error("Gagal menyimpan log file:", err);
  }


  // Coba kirim email asli
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Verifikasi Email Anda - Web Scanner',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Verifikasi Email Anda</h2>
          <p>Terima kasih telah mendaftar di Web Scanner. Untuk mengaktifkan akun Anda, silakan verifikasi email Anda dengan mengklik tombol di bawah ini:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verifikasi Email
            </a>
          </div>

          <p>Atau copy dan paste link berikut di browser Anda:</p>
          <p style="word-break: break-all; color: #007bff;">${verificationUrl}</p>

          <p>Link verifikasi akan kadaluarsa dalam 24 jam.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            Jika Anda tidak merasa mendaftar di Web Scanner, abaikan email ini.
          </p>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Real email sent to: ${email}`);
    console.log(`📫 Message ID: ${result.messageId}`);
    
  } catch (error) {
    console.log('⚠️ Real email failed, but verification link is in console above');
    console.error("Detail Error Nodemailer:", error); // Log error lebih detail untuk debugging
  }
};