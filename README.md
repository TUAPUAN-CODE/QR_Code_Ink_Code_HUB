# QR Code Tool — ใบแจ้งพิมพ์รหัสผลิตภัณฑ์

เว็บแอปหน้าเดียว (`Generate QR Code.html`) สำหรับ 1) สร้าง QR Code ลงในไฟล์ Excel ใบแจ้งพิมพ์รหัส และ 2) ตรวจสอบ QR Code ในไฟล์ — **ประมวลผลในเบราว์เซอร์ทั้งหมด ไฟล์ Excel ไม่ถูกส่งไปที่ใด**

โปรเจกต์นี้ให้ PM2 เป็นผู้ดูแลโปรเซสเสิร์ฟหน้าเว็บ (`server.js`) — เซิร์ฟเวอร์ **ไม่มี dependency** (เลิกใช้ Express และเอา `node_modules` ออกจาก git แล้ว) จึงไม่ต้องรัน `npm install` บนเครื่อง production

| รายการ | ค่า |
|---|---|
| ชื่อโปรเซส PM2 | `qr-code-ink-hub` (cluster 2 ตัว) |
| พอร์ต | `81` (เหมือนเดิม — แก้ที่ `ecosystem.config.js`) |
| ที่อยู่ใช้งาน | `http://<ที่อยู่เครื่อง>:81/` |
| ตรวจสุขภาพ | `GET /health` |
| Node.js | 18 ขึ้นไป |

## โครงสร้าง

```
Generate QR Code.html     หน้าเว็บทั้งหมด (ชื่อไฟล์เดิม)
server.js                 เซิร์ฟเวอร์ไฟล์สถิต (เสิร์ฟเฉพาะหน้าเว็บ, /vendor, /health)
ecosystem.config.js       ตั้งค่า PM2
vendor/                   ไลบรารีที่ฝังไว้ (ExcelJS, jsQR, qrcodejs) — ใช้งานได้โดยไม่ต้องต่ออินเทอร์เน็ต
tests/server.test.js      ทดสอบเซิร์ฟเวอร์ (npm test)
start_qr_tool_node.bat    ตัวเริ่มแบบเปิดหน้าต่างค้าง สำหรับใช้ชั่วคราว/ทดลอง (production ใช้ PM2)
logs/                     log ของ PM2 (ไม่ขึ้น git)
```

## ติดตั้งครั้งแรกบนเครื่อง production (Windows)

```bat
git clone https://github.com/TUAPUAN-CODE/QR_Code_Ink_Code_HUB.git
cd QR_Code_Ink_Code_HUB
npm test
pm2 start ecosystem.config.js
pm2 save
```

1. **ถ้าเดิมเปิดด้วย `start_qr_tool_node.bat` อยู่ ให้ปิดหน้าต่างนั้นก่อน** (ไม่งั้นพอร์ต 81 ชน)
2. ตรวจพอร์ตว่าง: `netstat -ano | findstr :81`
3. เปิดไฟร์วอลล์ขาเข้าพอร์ต 81 เฉพาะเครือข่ายภายใน
4. เปิด `http://localhost:81/` และ `http://localhost:81/health`

ลิงก์เดิมที่เคยบุ๊กมาร์กไว้ (`http://<เครื่อง>:81/` และ `.../Generate%20QR%20Code.html`) ใช้ได้ต่อ

ให้ PM2 เริ่มเองหลังเปิดเครื่อง: ตั้งตามที่ใช้กับโปรเจกต์อื่นบนเครื่อง (เช่น Task Scheduler ที่สั่ง `pm2 resurrect`) แล้ว `pm2 save` ทุกครั้งที่เพิ่ม/ลบโปรเซส

## อัปเดตโค้ด

```bat
cd QR_Code_Ink_Code_HUB
git pull
npm test
pm2 reload qr-code-ink-hub
```

`reload` สลับทีละตัวจากทั้งหมด 2 ตัว (cluster) และรอให้ตัวใหม่เปิดพอร์ตสำเร็จก่อน (`wait_ready`) ผู้ใช้จึงไม่เจอช่วงที่เปิดไม่ได้ — **ห้ามใช้ `pm2 restart all`** เพราะจะกระทบโปรเซสของโปรเจกต์อื่นบนเครื่อง

> หมายเหตุ: `git pull` ครั้งแรกหลังอัปเดตเวอร์ชันนี้จะ **ลบโฟลเดอร์ `node_modules` เดิม** ออกจากเครื่อง (ถูกเอาออกจาก git แล้ว) ไม่กระทบการทำงาน เพราะเซิร์ฟเวอร์ใหม่ไม่ใช้ Express

### ถอยกลับ

```bat
git log --oneline -5
git checkout <commit ก่อนหน้า> -- .
pm2 reload qr-code-ink-hub
```
(ถ้าถอยกลับไปเวอร์ชัน Express เดิม ต้องรัน `npm install` เพื่อติดตั้ง `node_modules` กลับมา)

## คำสั่งที่ใช้บ่อย

| ต้องการ | คำสั่ง |
|---|---|
| ดูสถานะ | `pm2 list` / `pm2 describe qr-code-ink-hub` |
| ดู log สด | `pm2 logs qr-code-ink-hub` |
| ดู log ย้อนหลัง | ไฟล์ `logs/out.log`, `logs/error.log` |
| ดูว่าใครเปิดหน้านี้ | ตั้ง `ACCESS_LOG: '1'` ใน `ecosystem.config.js` แล้ว `pm2 reload qr-code-ink-hub --update-env` |
| หยุดชั่วคราว | `pm2 stop qr-code-ink-hub` |

ตั้งตัวหมุน log ครั้งเดียวต่อเครื่อง (ใช้ร่วมกับทุกโปรเซส): `pm2 install pm2-logrotate`

## ความปลอดภัย

- **เวอร์ชันเดิมเสิร์ฟทุกไฟล์ในโฟลเดอร์** (`express.static(__dirname)`) รวม `server.js`, `package.json` — เวอร์ชันนี้เสิร์ฟเฉพาะหน้าเว็บ, `/vendor/*`, `/health` (มี test ตรวจว่าเปิดไฟล์อื่นไม่ได้)
- ไม่มีระบบ login — ใครเข้าถึงที่อยู่ได้ก็ใช้ได้ ควรเปิดเฉพาะเครือข่ายภายใน
- เซิร์ฟเวอร์ตั้ง Content-Security-Policy ให้โหลดได้เฉพาะจากตัวเอง (ไม่เรียกอินเทอร์เน็ต), ห้ามฝังในเว็บอื่น, ปฏิเสธ method ที่ไม่ใช่ GET/HEAD
- ห้ามใส่รหัสผ่าน/โทเคน/ข้อมูลลูกค้าลงในรีโปนี้

## อัปเกรดไลบรารีใน `vendor/`

ทดสอบกับไฟล์ Excel จริงทั้งหน้า "สร้าง" และ "ตรวจสอบ" ก่อน แล้วอัปเดตรายการใน `LICENSES-vendor.txt`

## แก้ปัญหาเบื้องต้น

| อาการ | สาเหตุที่พบบ่อย | วิธีแก้ |
|---|---|---|
| `pm2 list` เห็น `errored` | พอร์ต 81 ชน (เช่นหน้าต่าง `.bat` เดิมยังเปิดอยู่) | ปิดตัวที่ใช้พอร์ต หรือดู `logs/error.log` ถ้าเห็น `port_in_use` |
| เปิดหน้าไม่ขึ้นจากเครื่องอื่น | ไฟร์วอลล์ | เปิดพอร์ตขาเข้า 81 |
| หน้า "ตรวจสอบ QR Code" ช้า/ขึ้นโหมดสำรอง | เบราว์เซอร์ไม่รองรับ OffscreenCanvas | ใช้ Chrome/Edge รุ่นใหม่ |
