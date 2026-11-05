# MicroCAD Vision — CAD workspace, Phase 1

Phase 1: layout, tổ chức UI và contextual Inspector. Đặc tả Issue #2 do chủ dự án
cung cấp trực tiếp vì GitHub API bị proxy từ chối. Nhánh `feat/cad-workspace-ui`
bắt đầu từ đúng `598d3094f6449f7cacdae33800af12ba32bbfdbc`, không từ `main`.
PR này phải dùng base **`fix/ui-stability-audit`** cho tới khi Issue #1 được merge.

## Thay đổi

- Grid desktop: tool rail 60 px, thư viện 220–240 px, canvas dùng phần còn lại,
  Inspector 308–320 px. Header 48 px, thanh trạng thái 28 px.
- Chuyển thư viện ảnh và các node hiện có ra khỏi Inspector; giữ thumbnail,
  highlight, prev/next, số ảnh và hành vi chọn/import/export. Thư viện không cuộn
  theo thuộc tính và luôn hiện từ 1280 px trở lên.
- Inspector có ngữ cảnh công cụ, AI và hướng dẫn. Calibration chỉ hiện ở công cụ
  chuẩn; Row Spacing chỉ hiện ở công cụ 2 HÀNG. Tab AI độc lập với công cụ canvas
  và lựa chọn hàng tạm. Khi AI Batch khôi phục ảnh hiện tại, giữ tab AI để không
  làm mất vùng review. Không hiện danh sách phép đo rỗng.
- Giữ các node/ID/listener của panel động. Giữ các bản sửa Issue #1 về binding AI,
  Escape, lựa chọn hàng tạm, đổi ảnh và Ctrl+A.
- JSON chuyển lên header cùng CSV/PNG/ZIP; các thao tác import, reference, project,
  camera/snapshot vẫn dùng handler cũ. Nút CSV phụ cũ được giữ ẩn để bảo toàn ID và
  binding tương thích; chỉ một nút CSV hiển thị trên header.
- Zoom và tọa độ dùng lại node cũ, chuyển xuống footer cùng đơn vị, calibration,
  công cụ, số phép đo và trạng thái AI. Giá trị kỹ thuật dùng font monospaced.
- Giao diện charcoal/navy, cyan cho công cụ/phép đo, amber cho cảnh báo, giảm
  gradient/glow. Tag phân biệt `THỦ CÔNG Ø`, `AI ✓ Ø` đã chấp nhận và thẻ đề xuất AI;
  chỉ thay nhãn UI, không thêm hoặc sửa dữ liệu phép đo lưu trong file.
- Nút **Thuộc tính** thu gọn Inspector để mở rộng canvas. Ở 1024 px, Inspector ban
  đầu thu gọn và có thể mở theo dock; nút **Bộ ảnh** có thể thu gọn thư viện. Không
  dùng pane nổi phủ canvas. Khi trở lại desktop, thư viện tự hiện lại.

## Bảo toàn độ chính xác

Đã đối chiếu nguyên văn 27 khối mã đo/format/transform/calibration/history/export
với baseline: không thay đổi. Keyboard handler, pointer handlers, AI requests/API,
backend và các thuật toán Row Spacing không đổi. Chỉ nối thêm cập nhật Inspector
vào lifecycle UI và giữ Inspector khi đổi ảnh; trạng thái Inspector không serialize
vào history hoặc dự án.

Cùng một dự án tổng hợp với tọa độ và view cố định được mở trên HTML baseline và
HTML mới: JSON, CSV, PNG và ZIP **giống nhau từng byte**. Xem
[SHA-256 trước/sau](docs/cad-workspace/export-comparison.json). PNG vẫn 1400 × 850 px;
calibration 0.005 mm/px; vòng tròn bán kính 61 px, đường kính 610 µm. Đây là dữ liệu
tổng hợp cho kiểm thử hồi quy, không xác nhận độ chính xác đo lường thực nghiệm.

## Kiểm thử

- `node KIEM_THU_CAP_NHAT.js`: qua.
- `node MicroCAD_AI/tests/test_row_spacing.js`: qua 7 trường hợp.
- `tests/ui_stability.cjs`: 18/18 qua, không có JavaScript pageerror; 103 ID runtime
  duy nhất và tất cả ID literal được tham chiếu đều có trong DOM.
- Python: 2 passed, 3 cảnh báo deprecation FastAPI/Starlette có sẵn.
- Kiểm tra import/chuyển ảnh, calibration, đo thủ công, kéo nhãn, Undo, Save As/
  JSON round-trip, CSV/PNG/ZIP, AI Detect/Batch fixture, accept/reject, Row Spacing,
  phím tắt Issue #1, tab không đổi trạng thái đo, missing-model/manual fallback.
- Layout không tràn ngang hoặc chồng pane/canvas ở 1280×720, 1366×768, 1920×1080.
  Kiểm tra thu gọn/mở dock ở 1024×768 và tự hiện thư viện khi về desktop.

```bash
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright \
CHROMIUM_PATH=/usr/bin/chromium node --test tests/ui_stability.cjs
cd MicroCAD_AI
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 /workspace/microcad-env/bin/python -m pytest -q
```

Không thêm dependency vào ứng dụng; dùng Playwright/Chromium đã có để kiểm thử.
Máy cloud cần chế độ thực thi cho phép socket/browser. Để so sánh export cố định:
chạy ca `--test-name-pattern='fixed project'`, đặt `MICROCAD_UI_HTML` thành bản HTML
baseline khi cần và `MICROCAD_EXPORT_CAPTURE` thành thư mục kết quả ngoài checkout.

## Ảnh trước/sau và ghi chú sử dụng

Cùng dự án tổng hợp, cùng ảnh và phép đo, ở device scale factor 1. Không chỉnh sửa
ảnh chụp. Trạng thái AI trong ảnh là offline/model, phù hợp checkpoint đang thiếu.

| Độ phân giải | Trước — 598d309 | Sau — Phase 1 |
| --- | --- | --- |
| 1366×768 | [Trước](docs/cad-workspace/before-1366x768.png) | [Sau](docs/cad-workspace/after-1366x768.png) |
| 1920×1080 | [Trước](docs/cad-workspace/before-1920x1080.png) | [Sau](docs/cad-workspace/after-1920x1080.png) |

Trước sửa, chọn phép đo có thể cuộn thư viện ra khỏi vùng nhìn thấy. Sau sửa,
thư viện vẫn hiện trong dock riêng. Việc dành chỗ cố định cho thư viện làm canvas
ngang nhỏ hơn khi mở cả hai dock: 778×692 ở 1366×768, 1300×1004 ở 1920×1080.
Thu gọn Inspector trả lại 308/320 px ngang cho canvas và vẫn giữ thư viện. Không
thay đổi hàm fit/zoom để bù kích thước; hàm hiện có nhận diện tích viewport mới.

## Giới hạn và phần để sau

Chưa kiểm thử Windows native, USB camera, DPI/font Windows hoặc AI inference thật.
Thiếu checkpoint `MicroCAD_AI/runs/segment/hole_inner-2/weights/best.pt`; không tải,
huấn luyện, thay model hay đổi đường dẫn. Test AI UI dùng fixture xác định, không
xác nhận chất lượng model. Backend, models, datasets, secrets và môi trường Python
không bị sửa. Redo không phải tính năng hiện có và không được thêm trong Phase 1.

Phase 1 hoàn tất cho phạm vi layout/contextual UI đã kiểm thử. Tính năng selection/
annotation nâng cao và resize dock bằng kéo được để cho issue khác. GitHub API bị
proxy chặn; nếu chưa tạo được Draft PR, dùng nhánh/commit và báo cáo này để bàn giao.
