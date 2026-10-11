// PM2 ของ QR Code Tool — ใบแจ้งพิมพ์รหัสผลิตภัณฑ์
//   เริ่ม:        pm2 start ecosystem.config.js
//   อัปเดตโค้ด:   git pull แล้ว pm2 reload qr-code-ink-hub      (ห้ามใช้ pm2 restart all — จะกระทบโปรแกรมอื่นบนเครื่อง)
//   ดู log:       pm2 logs qr-code-ink-hub
//   เปลี่ยนพอร์ต: แก้ PORT ด้านล่าง แล้ว pm2 reload qr-code-ink-hub --update-env
module.exports = {
  apps: [
    {
      name: 'qr-code-ink-hub',
      script: 'server.js',
      cwd: __dirname,
      // cluster 2 ตัว: pm2 reload สลับทีละตัว ผู้ใช้ไม่เจอช่วงที่เปิดไม่ได้ และถ้าตัวหนึ่งล้ม อีกตัวรับต่อ
      // (โหมด fork reload = หยุดแล้วเริ่มใหม่ จะมีช่วงเปิดไม่ได้ราว 0.5 วินาที) — ใช้หน่วยความจำตัวละประมาณ 60 MB
      exec_mode: 'cluster',
      instances: 2,

      autorestart: true,
      watch: false,
      min_uptime: '10s',          // รันไม่ถึง 10 วินาทีแล้วตายถือว่าเริ่มไม่ขึ้น
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
      max_memory_restart: '200M',

      wait_ready: true,           // server.js ส่งสัญญาณ ready เมื่อเปิดพอร์ตสำเร็จ → reload รอตัวใหม่พร้อมก่อนจึงปิดตัวเก่า
      listen_timeout: 10000,
      kill_timeout: 5000,         // รอปิดอย่างนุ่มนวลก่อนบังคับ

      time: true,
      merge_logs: true,
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 81,
        ACCESS_LOG: '0',          // ตั้งเป็น '1' ชั่วคราวเมื่อต้องการดูว่าใครเปิดหน้านี้
      },
    },
  ],
};
