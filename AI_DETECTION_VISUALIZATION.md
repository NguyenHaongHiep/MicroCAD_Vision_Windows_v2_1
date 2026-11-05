# Issue #5 — Hiển thị đề xuất AI sau suy luận

Nhánh `feat/ai-detection-visualization` từ `47cf9ad` của
`feat/image-navigation-multiselect`; checkout ban đầu sạch. GitHub API đọc Issue #5
trả Forbidden, nên triển khai theo 10 yêu cầu trực tiếp của chủ dự án. Không thay
cấu hình môi trường đã publish, không publish lại và không merge main.

## Hành vi

- Khi request đang chờ: **Đang phân tích ảnh · YOLO đang xử lý toàn bộ ảnh…**.
- Sau một response hoàn chỉnh: hiện từng đề xuất bằng fade-in 220 ms, khoảng cách
  tối đa 140 ms giữa các lỗ. Với nhiều lỗ, rút ngắn khoảng cách để lượt hiển thị
  hoàn tất trong khoảng 4.24 giây cộng chi phí vẽ. Đây là animation **sau suy luận**,
  không phải nhận dạng YOLO từng lỗ theo thời gian thực.
- Mỗi đề xuất có polygon segmentation nếu API cung cấp ít nhất 3 điểm hợp lệ,
  vòng tròn khớp nét đứt, tâm, số thứ tự và confidence. Thiếu polygon vẫn vẽ vòng
  tròn; không tự bịa đường biên segmentation.
- Bộ đếm `1/23…23/23` ở Inspector và ngay canvas. **Hiển thị tất cả** hủy animation
  và vẽ toàn bộ ngay, không gọi lại API. Reduced motion bỏ qua animation.
- Đề xuất vẫn nằm trong `aiPending`, không tăng số phép đo. Chấp nhận/loại bỏ giữ
  luồng cũ, kết thúc animation để tránh timer bám dữ liệu cũ. Undo vẫn hoạt động.
- Animation chỉ giữ trạng thái UI ngoài doc/history/export, ràng buộc theo imageId
  và đúng mảng proposal. Đổi ảnh, mở ảnh mới, Undo hoặc Batch hủy animation. Quay
  lại ảnh cũ hiển thị toàn bộ proposal của chính ảnh đó, không chạy lại animation.
- Response về muộn được bỏ nếu imageId hoặc nguồn ảnh đã đổi. Không gán lên ảnh mới.
- Batch không chạy/chờ animation; vòng lặp request và model/API contract giữ nguyên.
  Không thêm delay vào suy luận. Chỉ thay lớp hiển thị proposal trên canvas.
- Segmentation/animation/counter không nằm trong đường render export; calibration,
  geometry, dữ liệu AI, serializer, model và backend không thay đổi.

## Kiểm thử

**50/50 ca Node test runner qua**, gồm 44 ca hồi quy và 6 ca visualization:

1. Trạng thái phân tích trước response; counter tăng sau response, skip, accept/Undo.
2. Đổi ảnh giữa animation không hiện kết quả ảnh trước; quay lại thấy đúng proposal.
3. Batch hiển thị ngay và reduced motion không đợi animation.
4. Canvas thực sự gọi vẽ polygon, arc, tâm và nhãn ordinal/confidence; số phép đo 0.
5. Thay nguồn ảnh khi request đang pending: response cũ bị bỏ.
6. Response rỗng/lỗi API: hết busy, không tạo animation hoặc phép đo.

Hồi quy: chọn nhóm, điều hướng 12 ảnh, zoom/pan/DPI, đo từ vùng chọn, 2/3 hàng,
preview/Undo, AI review, layout và DOM đều qua; 132 ID runtime duy nhất, không
pageerror. `KIEM_THU_CAP_NHAT.js` và 7 ca hình học Row Spacing qua. Python 2 passed,
3 cảnh báo deprecation FastAPI/Starlette có sẵn.

Máy khôi phục chạy nhanh làm bài test tải hơn 10 file liên tiếp timeout. Đã tái
hiện cùng lỗi trên HTML baseline chưa sửa. Helper test được thêm pacing 150 ms
để tránh giới hạn burst download của Chromium; baseline và bản mới cùng qua.
Không sửa download/export của ứng dụng, giữ mọi phép so sánh byte.

Dự án cố định xuất JSON/CSV/PNG/ZIP giống baseline `47cf9ad` từng byte:
[SHA-256](docs/ai-visualization/export-comparison.json).

```bash
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright \
CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=1 \
  tests/ai_visualization.cjs tests/ui_stability.cjs \
  tests/image_navigation_multiselect.cjs tests/selection_geometry.cjs
node KIEM_THU_CAP_NHAT.js
node MicroCAD_AI/tests/test_row_spacing.js
```

[Ảnh trình duyệt 1366×768](docs/ai-visualization/ai-proposals-1366x768.png) dùng
23 proposal có polygon giả lập trên ảnh demo tổng hợp; không phải kết quả YOLO thật.
Đặt `AI_CAPTURE_DIR` thành thư mục ngoài checkout để tạo lại ảnh từ test.

Giới hạn: Chromium/Linux, chưa Windows native/USB camera hoặc inference model thật.
Checkpoint trained `runs/segment/hole_inner-2/weights/best.pt` không có; không tải,
huấn luyện hoặc thay model. Không thay dependency hay cấu hình publish.
