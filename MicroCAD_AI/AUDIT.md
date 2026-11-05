# Audit MicroCAD Vision v2.3

## Mã nguồn và state

- Ứng dụng thật: `../MicroCAD_Vision.html`, một HTML đơn tệp, không có Git repository.
- Ảnh đang hoạt động nằm trong `doc.source`; bản gốc dạng data URL ở `doc.dataUrl`; kích thước gốc là `doc.width`, `doc.height`.
- Bộ ảnh nằm trong `images`; `stashActive()`/`snapshotDoc()` đồng bộ ảnh hiện tại về record.
- Calibration nằm trong `record.cal.mmPerPx`; `latestCalibration` được sao chép sang ảnh mới. `formatMeasurement()` đổi pixel sang mm/µm.
- Tất cả geometry measurement lưu theo pixel ảnh gốc. `screen()` và `world()` chỉ đổi giữa tọa độ ảnh và Canvas bằng `doc.view.{x,y,z}`.

## Chức năng cần bảo toàn

- Auto Detect cũ: `detectInnerHoleCircles()` → `autoDetectCurrent()`; Auto Batch: `autoDetectAll()`.
- Undo theo ảnh: `historyPush()`/`pushRecordHistory()` và `undo()`.
- Export: `buildPNG()` render 1:1; `makeCSV()`; `exportAll()` tạo ZIP không phụ thuộc mạng.
- Manual measurement và calibration đều dùng cùng `doc.measures` nhưng có metadata riêng.

## Điểm tích hợp

Lớp AI được đặt cuối IIFE hiện có để truy cập state mà không viết lại ứng dụng. Nó thêm hai button bằng DOM, gọi `http://127.0.0.1:8000`, xác nhận kích thước trả về khớp ảnh gốc, rồi thêm circle có `ai:true`. Nó không xóa phép đo thủ công, dùng history trước khi thêm, bỏ detection trùng và vô hiệu hóa khi engine/model offline. Auto Detect OpenCV cũ vẫn nguyên vẹn.

## Giới hạn hiện tại

- Chưa có `models/best.pt`; API health chạy được sau setup nhưng AI button chỉ bật khi model tồn tại.
- Chưa có dataset polygon thật, nên không có chỉ số độ chính xác đáng tin cậy.
- Python 3.11 chưa được cài/không có trong PATH; chưa thể chạy pytest hoặc xác nhận `torch.cuda.is_available()`.
