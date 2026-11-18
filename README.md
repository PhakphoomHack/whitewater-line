# Whitewater Desk v0.3

เกมตัดสินใจบนแม่น้ำ สำหรับหลักสูตร Accelerating Business Decisions

## หน้าจอ
- `/stage` จอใหญ่ (แล็ปท็อปที่ต่อโปรเจกเตอร์) เป็นสมองของเกม ต้องเปิดค้างไว้ตลอด
- `/host` รีโมทของพิธีกรบนมือถือ เข้าด้วยอีเมลแอดมิน (ลิงก์ทางอีเมล) หรือ PIN ที่แสดงบนจอใหญ่
- `/play` มือถือผู้เล่น สแกน QR บนจอใหญ่

## ลำดับเกม
ล็อบบี้ > อธิบายกติกาด้วยเสียง 6 สไลด์ > รอบ 1 (ธรรมดา) > เฉลย > รอบ 2 (มีตลาดแลกข้อมูล 90 วินาที) > เฉลย > สรุปผล
- แม่น้ำขึ้น: เมื่อสองในสามของโต๊ะผนึกแล้ว และเวลาผ่านไปครึ่งรอบ โต๊ะที่เหลือมีเวลา 2 นาที (พิธีกรสั่งขึ้นเองหรือยกเลิกได้)

## การเชื่อมต่อ
- ค่าเริ่มต้น: Supabase Realtime (ค่าอยู่ใน `src/game/config.ts`) ใช้ได้หลายเครื่องจริง
- ทดสอบในเบราว์เซอร์เดียว: เติม `?net=local` ท้าย URL

## วางบน Cloudflare Pages
1. Workers & Pages > Create > Pages > Connect to Git > เลือก `whitewater-desk`
2. Framework preset: None, Build command: `npx next build`, Build output directory: `out`
3. Environment variable: `NODE_VERSION` = `20`
4. Supabase > Authentication > URL Configuration: ใส่ Site URL เป็นโดเมนที่ได้ และเพิ่ม Redirect URL `https://<โดเมน>/**`

## คำสั่ง
- `npm install` แล้ว `npm run build` ได้โฟลเดอร์ `out/` เป็นเว็บนิ่ง
- `npm test` ทดสอบกติกา 38 ข้อ และให้บอทเล่น 300 เกม
- `npx tsx tests/market.test.ts` ทดสอบตลาดและแม่น้ำขึ้น 24 ข้อ
- `node tests/e2e.js http://localhost:3100` ทดสอบเต็มเกมด้วยมือถือจำลอง 30 เครื่อง (เวลาเร็วขึ้น 10 เท่า)
