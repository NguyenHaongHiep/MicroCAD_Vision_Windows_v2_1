# UI stability audit — Issue #1

Đặc tả: nội dung Issue #1 do chủ dự án cung cấp trong phiên làm việc. Không đọc
được Issue trực tiếp vì proxy từ chối GitHub API; không thay đổi quyền repository.
Checkout ban đầu sạch, HEAD `e1bac5d`; thực hiện trên `fix/ui-stability-audit`.

## Lỗi đã tái hiện và sửa

| Cách tái hiện trước sửa | Nguyên nhân và hành vi sau sửa |
| --- | --- |
| Tạo đề xuất AI, bấm **Chấp nhận** ngay trên thẻ: phép đo được thêm nhưng mất trạng thái chọn/editor. | `renderList()` gắn listener lên cả thẻ AI dùng chung `.meas-item`. Listener có thể được gắn vào ancestor ngay trong lúc click đang bubble và đọc `data-id` không tồn tại. Giới hạn listener trong `#measureList`; phép đo vừa chấp nhận vẫn được chọn. |
| Đang chọn phép đo thủ công, tạo đề xuất AI rồi **Loại bỏ** trên thẻ: mất lựa chọn hiện tại. | Cùng lỗi binding; loại bỏ đề xuất không còn ghi đè lựa chọn phép đo. |
| Chọn tâm vào Hàng 1, xóa đường tròn: nút vẫn ghi `Hàng 1 (1)`. | `updateUI()` chưa cập nhật panel hàng. Panel nay đồng bộ số đếm và bỏ tham chiếu tạm không còn tồn tại. |
| Chọn tâm vào Hàng 1, nhập/chuyển ảnh khác rồi vào lại 2 HÀNG: còn số đếm của ảnh trước. | Lựa chọn hàng là trạng thái tạm toàn cục. Khi thoát công cụ, xóa ngữ cảnh tạm; không sửa phép đo đã lưu. |
| Chọn tâm vào Hàng 1, nhấn Escape: vẫn ở ROWSPACING và giữ lựa chọn; panel cũng luôn hiện khi dùng công cụ khác. | Escape gọi đường hủy có sẵn; panel chỉ hiện khi công cụ `rowSpacing` đang hoạt động. |
| Khi canvas đang hoạt động, nhấn Ctrl+A: công cụ chuyển sang ANGLE. | Handler không loại trừ tổ hợp Ctrl/Meta/Alt. Giữ nguyên Ctrl/Meta+Z và +S; các tổ hợp khác không kích hoạt phím tắt công cụ đơn. |

Chỉ sửa `MicroCAD_Vision.html` ở binding, đồng bộ panel/ngữ cảnh tạm và routing
phím tắt. Không sửa hình học, calibration, đơn vị, transform, hàm Undo, định dạng
export hoặc API backend. Không thay đổi model, dataset, secrets hay backups.

## Kiểm thử

- DOM: 75 ID có trong HTML ban đầu và 12 ID tạo động, tổng 87 ID runtime duy nhất;
  các tham chiếu `$('<id>')` literal đều tồn tại sau khởi tạo.
- Chạy cùng 7 ca tập trung vào lỗi trên HTML gốc lấy bằng `git show`: kiểm tra DOM
  qua, **6 ca tái hiện lỗi thất bại**. Sau sửa, cả 7 qua.
- `node KIEM_THU_CAP_NHAT.js`: qua (fitCircle, nhãn, calibration và tên ZIP).
- `node MicroCAD_AI/tests/test_row_spacing.js`: qua 7 trường hợp hình học.
- `OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 /workspace/microcad-env/bin/python -m pytest -q`
  trong `MicroCAD_AI`: **2 passed**, 3 cảnh báo deprecation FastAPI/Starlette.
- `tests/ui_stability.cjs`: **11/11 qua** trên Chromium. Bao gồm các ca lỗi trên,
  import/chuyển ảnh, calibration, vòng tròn thủ công, kéo nhãn, Undo, lưu/mở JSON,
  CSV/PNG/ZIP, AI Detect/Batch giả lập, chấp nhận/loại bỏ và tính Row Spacing.
  Mỗi ca kiểm tra không có JavaScript `pageerror`.
- Layout desktop: 1280, 1366 và 1920 × 768; sidebar không chồng canvas,
  thư viện ảnh vẫn truy cập được bằng cuộn sidebar. Không thiết kế lại giao diện.
- Mẫu tổng hợp: 1 mm / 200 px, bán kính 61 px, đường kính xấp xỉ 122 px / 610 µm;
  PNG giữ 1400 × 850 px. Các giá trị có sai số rất nhỏ do tọa độ click trình duyệt.
- Xuất cùng đầu vào trên HTML trước/sau sửa: JSON, CSV, PNG và ZIP **giống nhau
  từng byte**, đã đối chiếu nội dung và SHA-256 của cả bốn tệp.

## Chạy lại kiểm thử trình duyệt

Không thêm dependency vào ứng dụng hoặc manifest. Test sử dụng Playwright/Chromium
có sẵn trong môi trường; tự tạo HTTP server localhost với port tạm, đóng server và
browser sau khi chạy. Có thể dùng Playwright được cài sẵn thông thường hoặc chỉ rõ
đường dẫn module/browser:

```bash
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright \
CHROMIUM_PATH=/usr/bin/chromium node --test tests/ui_stability.cjs
```

Trong máy cloud này, chạy bằng chế độ thực thi cho phép socket/browser; sandbox
chặn socket không phù hợp để chạy TestClient hoặc Chromium.

Để so sánh một bản HTML gốc mà không đổi checkout, đặt `MICROCAD_UI_HTML` thành
đường dẫn file đó. Đặt `MICROCAD_EXPORT_CAPTURE` thành thư mục ngoài checkout nếu
cần lưu bộ JSON/CSV/PNG/ZIP của ca manual calibration để so sánh.

## Giới hạn

- Thiếu checkpoint `MicroCAD_AI/runs/segment/hole_inner-2/weights/best.pt`.
  Không tải/huấn luyện model, không đổi đường dẫn. Test AI trong bộ trình duyệt
  dùng response fixture xác định, **không xác nhận inference hoặc độ chính xác AI**.
- Chạy trên Linux Chromium với kích thước desktop; chưa xác nhận trên Windows
  native, driver USB camera, launcher PowerShell hay DPI/font thực tế của Windows.
- Ứng dụng hiện có Undo, không có lệnh Redo riêng để kiểm thử; không thêm tính năng.
- Loader JSON có sẵn chuẩn hóa `fitRms` thiếu thành 0 khi mở dự án; test giữ nguyên
  hành vi này, không sửa logic nạp dữ liệu.
- GitHub API bị từ chối tại proxy; việc tạo Draft PR cần thực hiện khi có quyền
  truy cập hiện hữu phù hợp. Không merge hoặc push trực tiếp lên `main`.
