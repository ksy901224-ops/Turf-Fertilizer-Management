
/**
 * Firebase Cloud Function for Admin Notifications
 * Deploy this using: firebase deploy --only functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// Configure your email transporter using Environment Variables
// Check process.env first (standard), then functions.config() (legacy/CLI set)
const gmailEmail = process.env.GMAIL_EMAIL || functions.config().gmail?.email;
const gmailPassword = process.env.GMAIL_PASSWORD || functions.config().gmail?.password;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailEmail,
    pass: gmailPassword,
  },
});

exports.sendAdminNotificationOnSignup = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap, context) => {
    const newUser = snap.data();
    
    // Requirement: Process only if approved is false (new signups are usually false)
    // Note: Use 'isApproved' or 'approved' depending on your DB schema. API uses 'isApproved'.
    const isUnapproved = newUser.isApproved === false || newUser.approved === false;

    if (!isUnapproved) {
      console.log("User created but already approved or status unknown, skipping email.");
      return null;
    }

    const adminEmail = process.env.ADMIN_EMAIL || "admin@turf-management.com";

    const mailOptions = {
      from: '"Turf Manager App" <noreply@turf-management.com>',
      to: adminEmail,
      subject: `새로운 회원가입 요청: ${newUser.username}, ${newUser.golfCourse}`,
      html: `
        <h2>새로운 회원가입 요청이 있습니다.</h2>
        <p><strong>사용자명:</strong> ${newUser.username}</p>
        <p><strong>골프장:</strong> ${newUser.golfCourse}</p>
        <p><strong>가입일시:</strong> ${new Date().toLocaleString()}</p>
        <br/>
        <p>앱 관리자 대시보드에서 승인해주세요.</p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("Admin notification email sent for user:", newUser.username);
    } catch (error) {
      console.error("Error sending admin notification email:", error);
    }
  });
