# Issue #3 — Image navigation and CAD multiselect

Quy trình đo hình học từ vùng chọn đã được bổ sung ở
[Đo hình học từ vùng chọn nhiều đường tròn](SELECTION_MEASUREMENT_WORKFLOW.md).

Branch `feat/image-navigation-multiselect` bắt đầu từ `feat/cad-workspace-ui`,
commit `e78d34883cb7c7fc04c3108e91747e0cef1e8d98`; checkout ban đầu sạch. Giữ toàn
bộ layout Phase 1 và các bản sửa Issue #1. Đặc tả do chủ dự án cung cấp trực tiếp;
GitHub API trả `Forbidden`. PR phải xếp trên base **`feat/cad-workspace-ui`**.

## Hành vi đã triển khai

- ↑/↓ gọi lại `activateImage()` theo thứ tự hiện tại trong thư viện; không wrap.
  Dùng highlight, imagePosition, stash và logic tự cuộn thumbnail có sẵn.
  Chỉ preventDefault khi thực sự đổi ảnh. Bỏ qua input, textarea, select,
  contenteditable, widget điều hướng riêng, modal, busy, camera live và pointer
  gesture đang diễn ra.
- Click nhãn hoặc đường hình học ở công cụ CHỌN chọn một phép đo. Ctrl/Cmd+click
  toggle một phép đo; áp dụng trên canvas và danh sách. Shift+click trong danh sách
  chọn dải theo anchor; không có anchor thì chọn một mục. Ctrl/Cmd+Shift chọn dải
  cộng thêm. Click vùng trống không modifier bỏ chọn.
- Kéo từ vùng trống trên canvas: trái→phải là window (viền cyan liền), phải→trái
  là crossing (viền xanh lá đứt). Ngưỡng kéo 4 CSS px; Ctrl/Cmd/Shift cộng vùng chọn.
  Khung và hit-test dùng tọa độ ảnh gốc qua transform sẵn có, không sửa transform.
- Chọn theo hình học phép đo, không theo bounding box của nhãn hoặc AI proposal.
  Vòng tròn dùng đường tròn toán học: crossing cần vành giao vùng chữ nhật;
  chữ nhật nằm hoàn toàn bên trong vòng tròn và không chạm vành sẽ không chọn nó.
  Đo thẳng/circleGap/Row Spacing dùng đoạn hữu hạn p1–p2; góc dùng cả hai cánh.
  Click hình học có dung sai 7 CSS px, độc lập mức zoom. Nhãn vẫn có hit-test cũ.
- Ctrl/Cmd+A chỉ ở công cụ CHỌN; Esc bỏ chọn và hủy marquee. Những Esc của các
  công cụ khác, đặc biệt Row Spacing, giữ luồng cũ. Click riêng của Row Spacing và
  circleGap được ưu tiên, không chạy chọn nhóm.
- Canvas, danh sách, aria-selected và selectedCount cùng phản ánh một Set ID.
  Một mục giữ editor tên; nhiều mục có mô tả nhóm và nút xóa nhóm phía trên danh
  sách. Kéo nhãn trong nhóm chỉ di chuyển nhãn đang kéo, không group move.
- Delete/nút xóa nhóm tạo đúng một snapshot Undo. Xóa các circleGap/Row Spacing
  phụ thuộc khi xóa đường tròn theo quy tắc cũ, không để tham chiếu orphan. Nút X
  trên từng thẻ vẫn chỉ xóa mục đó và các phép đo phụ thuộc.
- Undo khôi phục dữ liệu và nhóm chọn bằng metadata WeakMap ngoài history payload.
  Các entry history vẫn có cấu trúc `measures/cal/selected/aiPending` như trước.
  Không thêm trường vào JSON/CSV/PNG/ZIP hoặc measurement records.
- Nhóm chọn không lưu/xuất. Khi đổi ảnh, nhóm tạm và anchor được reset; một lựa
  chọn đơn legacy `doc.selected` của chính ảnh đó có thể được khôi phục. Không dùng
  nhóm ID của ảnh trước cho ảnh mới. AI đã chấp nhận là phép đo thường; proposal
  chưa chấp nhận luôn tách riêng, không bị chọn/xóa nhóm.

## Kiểm thử

Lượt hồi quy cuối: **35 ca Node test runner qua** gồm 18 ca UI cũ, 13 ca browser
mới và 4 ca selection geometry/navigation guard. Ngoài ra:

- `node KIEM_THU_CAP_NHAT.js`: qua.
- `node MicroCAD_AI/tests/test_row_spacing.js`: 7 trường hợp qua.
- Python hiện có: 2 passed, 3 cảnh báo deprecation FastAPI/Starlette.
- Không pageerror; 105 ID runtime duy nhất, không thiếu ID literal được tham chiếu.
- 12 ảnh: đi ↑/↓ tới hai biên, không wrap, thumbnail tự cuộn, dữ liệu đo/calibration
  giữ nguyên khi quay lại; kiểm tra defaultPrevented đúng ở biên/đổi ảnh.
- Input/select/contenteditable/listbox/modal/gesture không đổi ảnh; busy request
  AI fixture chặn navigation. Camera guard được kiểm tra độc lập, không mở camera.
- Ctrl/Cmd toggle, Shift range/no-anchor, Ctrl+A/Esc, canvas/list đồng bộ, nút xóa
  nhóm, dependent delete và một Undo khôi phục đúng dữ liệu/selection.
- Window/crossing ở zoom 50%, 200%, pan và DPI 2; Escape hủy marquee; geometry/
  label không dịch khi chọn. Kéo riêng nhãn trong nhóm và Undo được kiểm tra.
- Pending AI proposal còn nguyên sau group Delete/Undo; AI Detect/Batch/review và
  Row Spacing của bộ hồi quy cũ vẫn qua. Các ca AI dùng fixture xác định.
- JSON/CSV/PNG/ZIP không đổi khi chỉ chọn nhóm. Với dự án đầu vào cố định trên
  baseline e78d348 và bản mới, cả bốn tệp giống nhau từng byte; xem
  [SHA-256](docs/image-selection/export-comparison.json).
- 28 khối thuật toán đo/fit/transform/calibration/export/AI được đối chiếu nguyên
  văn với baseline và không đổi. Backend, model, dataset, secrets không bị sửa.

```bash
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright \
CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=1 \
  tests/ui_stability.cjs tests/image_navigation_multiselect.cjs tests/selection_geometry.cjs
node KIEM_THU_CAP_NHAT.js
node MicroCAD_AI/tests/test_row_spacing.js
cd MicroCAD_AI
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 /workspace/microcad-env/bin/python -m pytest -q
```

Không thêm dependency. Máy cloud cần chế độ cho phép socket/Chromium và child
test processes để các ca thật sự chạy. Đặt `MICROCAD_SCREENSHOT_DIR` thành thư mục
ngoài checkout để chạy lại capture ảnh từ ca desktop multiselect.

## Demo và cách thử trên Windows

Ảnh chụp Chromium Linux, dữ liệu tổng hợp có một phép đo AI accepted fixture,
không phải kết quả đo/inference thực tế:
[1280×720](docs/image-selection/multiselect-1280x720.png),
[1366×768](docs/image-selection/multiselect-1366x768.png),
[1920×1080](docs/image-selection/multiselect-1920x1080.png).

1. Mở dự án trên Chrome/Edge, nhập ít nhất 5 ảnh. Đưa focus ra khỏi ô nhập, dùng
   ↑/↓ tới đầu/cuối và kiểm tra thumbnail, tên ảnh, calibration và phép đo.
2. Chọn CHỌN [V], Ctrl+click 3 phép đo; Ctrl+click lần nữa bỏ một; click một mục
   làm anchor rồi Shift+click mục khác để chọn dải. Ctrl+A/Esc chọn hết/bỏ chọn.
3. Từ vùng trống, kéo trái→phải bao trọn hình; kéo phải→trái cắt vành/đoạn thẳng.
   Thử lại sau pan, zoom 50%/200%; giữ Ctrl hoặc Shift để cộng vùng chọn.
4. Delete hoặc nút xóa nhóm, rồi Ctrl+Z: khôi phục toàn bộ nhóm và phép đo phụ
   thuộc. Thử với circleGap/Row Spacing liên quan; pending AI không bị xóa.
5. Chọn nhiều, kéo một nhãn: chỉ nhãn đó đổi chỗ. Undo khôi phục nhãn; geometry,
   kích thước, calibration không đổi. Thử nhập tên với ↑/↓ để xác nhận không đổi ảnh.
6. Lưu JSON/CSV/PNG/ZIP và đổi ảnh qua lại; nhóm của ảnh cũ không áp sang ảnh mới.

Chưa kiểm thử Windows native, USB camera hoặc inference model thật. Thiếu trained
`best.pt` như các task trước; không tải/huấn luyện model, không đổi đường dẫn.
Không group move hay thay đổi hình học phép đo. Không merge/push trực tiếp main.
