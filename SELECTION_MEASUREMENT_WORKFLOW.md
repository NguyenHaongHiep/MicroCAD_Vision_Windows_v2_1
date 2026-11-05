# Đo hình học từ vùng chọn nhiều đường tròn

Tiếp tục trên `feat/image-navigation-multiselect`, baseline `6911697`, checkout ban
đầu sạch. Bổ sung lệnh đo từ chính vùng chọn hiện có; giữ các luồng chọn/xóa/Undo,
điều hướng ảnh, UI CAD, AI và các công cụ hai bước cũ.

## Sử dụng

1. Chọn **CHỌN [V]**, Ctrl/Cmd+click hoặc khoanh vùng các đường tròn đã đo.
   Các nút đo nằm ngay trong nhóm thao tác vùng chọn ở Inspector. Nếu chọn lẫn
   đường tròn và phép đo khác, dùng **Chỉ giữ đường tròn**; không chọn AI proposal.
2. **Đo mép–mép**:
   - Đúng 2 đường tròn: tự điền một cặp xem trước bằng ID nguồn; không chọn lại.
   - Từ 3 đường tròn: không tự sinh cặp. Chọn A/B rồi **Thêm cặp xem trước**, hoặc
     nhập danh sách `ID A, ID B`, mỗi cặp một dòng, rồi **Thêm danh sách cặp**.
   - Danh sách xem trước cho biết từng cặp, giá trị và quan hệ hai đường tròn.
     Có thể **Bỏ cặp**. Cặp trùng/đảo chiều không lặp lại trong cùng lần tính.
     Nếu input chứa một cặp sai, không thêm phần đúng dở dang.
3. **Đo khoảng cách 2 hàng**:
   - Chọn các lỗ trong danh sách nguồn bằng Ctrl/Shift; bấm **→ Hàng 1** hoặc
     **→ Hàng 2**. Mỗi hàng tối thiểu 2 lỗ. **Bỏ gán** trả lỗ về chưa gán.
   - Muốn 3 hàng, chọn **3 hàng → H1–H2, H2–H3**, rồi gán thêm **→ Hàng 3**.
     Cần tối thiểu 6 đường tròn. Mỗi lỗ chỉ thuộc một hàng; gán sang hàng khác là
     chuyển hàng, không nhân bản tâm. Lỗ chưa gán không được dùng trong tính toán.
   - H1 vàng, H2 tím, H3 cyan; hiện số lượng, màu trong danh sách gán và vòng/nhãn
     H1/H2/H3 trên canvas. Đây là màu hướng dẫn lúc gán/xem trước; các kết quả lưu
     dùng renderer hai hàng có sẵn.
4. Kiểm tra **Xem trước · chưa lưu**, rồi bấm **Tính toán**. Khi thiếu tâm hoặc
   hàng vượt giới hạn góc của thuật toán hiện có, nút tính bị khóa và nêu lỗi.
   Với 3 hàng, chỉ tạo H1–H2 và H2–H3, không tạo H1–H3.
5. Ctrl+Z khôi phục toàn bộ lần tính và vùng chọn đường tròn nguồn, kể cả một lô
   nhiều cặp hoặc hai kết quả 3 hàng. Hủy/Esc/đổi vùng chọn/đổi ảnh bỏ kế hoạch tạm,
   không tạo phép đo. ↑/↓ chuyển ảnh khi focus ở ngoài ô nhập như trước.

## Độ chính xác và dữ liệu

- Kế hoạch chỉ giữ ID cặp và gán hàng trong biến UI riêng. Xem trước dùng các hàm
  hình học hiện có, không cấp ID phép đo, không ghi history, không chỉnh circle.
- Khi xác nhận mép–mép, gọi nguyên hàm **`makeCircleGap()`** cho từng cặp đã duyệt.
- Khi xác nhận hàng, dùng nguyên **`rowSpacingGeometry()`** cho các tâm đã gán.
  3 hàng là hai đối tượng `rowSpacing` thông thường với `row1Ids/row2Ids`, không
  thêm loại đối tượng hay trường schema mới.
- Tất cả hàng/cặp được kiểm tra trước snapshot và cấp ID. H2–H3 lỗi sẽ không để
  lại kết quả H1–H2 hoặc history tạo dở. Một lần tính có một bước Undo.
- Không thay tọa độ, r/đường kính, calibration, AI data, công thức fit/gap/row,
  transform hoặc serializer. Chỉ thêm dữ liệu phép đo sau khi bấm Tính toán.
- Xem trước không xuất ra PNG/CSV/JSON/ZIP. JSON chứa kết quả mới được mở lại bằng
  loader/schema hiện có; dự án baseline và round-trip được kiểm tra trong hồi quy.
- Chọn nguồn được snapshot theo ID; đổi vùng chọn/ảnh hoặc mất nguồn sẽ hủy kế
  hoạch. Các công cụ G/R cũ vẫn theo luồng tương tác cũ, không bị ghi đè.
- Không sinh n×(n−1)/2 cặp. UI nguồn có O(n) option, danh sách kết quả có O(p)
  mục theo p cặp do người dùng yêu cầu; test thực tế 120 đường tròn/60 cặp.

## Kiểm thử

- **44/44** ca Node test runner qua: 35 ca trước và 9 ca quy trình đo mới.
- Quy trình Ctrl/chọn khung → lệnh gap → preview → tính → Undo; ID nguồn đúng,
  preview không tiêu hao ID, không đổi circle AI accepted hoặc manual.
- Từ 3 đường tròn chỉ tạo cặp chỉ định, lọc cặp trùng, kiểm tra input batch nguyên
  tử, bỏ cặp trước tính. 120 đường tròn chỉ tạo đúng 60 cặp chỉ định; một Undo.
- 4 đường tròn → gán 2+2 → một `rowSpacing`, khoảng cách chuẩn trong fixture.
- 3 hàng → đúng H1–H2 và H2–H3; một Undo; mở lại JSON giữ nguyên dữ liệu phép đo.
- Gán độc quyền, thiếu số tâm, lỗ không gán, lỗi góc ở H2–H3 không tạo một phần;
  hủy/Esc/đổi ảnh; selection lẫn loại và lọc lại đường tròn.
- Preview/hủy giữ nguyên từng byte JSON/CSV/PNG/ZIP. Dự án cố định so với baseline
  `6911697` cũng cho bốn file giống nhau từng byte; xem
  [SHA-256](docs/selection-measurement/export-comparison.json).
- 30 khối mã công thức/transform/calibration/serialization/AI được so sánh nguyên
  văn với baseline và không thay đổi, gồm makeCircleGap và Row Spacing.
- Các hồi quy ↑/↓ 12 ảnh, zoom 50%/200%, pan, DPI 2, kéo nhãn, AI fixture,
  Row Spacing cũ, xóa nhóm, Undo, DOM ID/pageerror và layout vẫn qua.
- `node KIEM_THU_CAP_NHAT.js` và test Row Spacing 7 ca qua; Python 2 passed,
  3 cảnh báo deprecation có sẵn. Không thay backend/models/dataset/secrets.

```bash
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright \
CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=1 \
  tests/ui_stability.cjs tests/image_navigation_multiselect.cjs tests/selection_geometry.cjs
node KIEM_THU_CAP_NHAT.js
node MicroCAD_AI/tests/test_row_spacing.js
```

Giới hạn: browser chạy Chromium/Linux, AI dùng fixture, không kiểm thử Windows
native/USB camera/inference checkpoint thật. Không tải hoặc huấn luyện model.
Không thêm dependency. Không merge vào main; commit/push trên chính nhánh tính năng.

[Ảnh xem trước 3 hàng trên dữ liệu tổng hợp](docs/selection-measurement/three-row-preview-1366x768.png).
