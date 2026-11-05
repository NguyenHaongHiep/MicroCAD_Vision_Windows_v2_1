# Loại bỏ Legacy Auto Detect — MicroCAD Vision

Ngày: 2026-11-05  
Phạm vi: chỉ `MicroCAD_Vision.html`; không sửa YOLO checkpoint, dataset, training hoặc FastAPI.

## Bảo toàn

- Bản sao lưu trước sửa: `backups/remove_legacy_auto_20261105_130158/MicroCAD_Vision.html`.
- Không xóa hoặc biến đổi phép đo đã lưu. Project cũ có `auto: true` vẫn được mở và hiển thị là **LEGACY Ø**.
- Project có phép đo AI đã lưu (`ai: true`) vẫn được mở và hiển thị là **AI Ø**, bao gồm confidence và review state.
- `fitCircle`, các công cụ đo tay, calibration, Undo, Export CSV/PNG/ZIP và JSON project được giữ nguyên.

## Đã loại bỏ

- Toàn bộ section UI `AUTO / Dò mép trong`.
- Khoảng đường kính, chọn `Chặt / Cân bằng / Nhạy`, checkbox thay thế kết quả cũ và cả hai nút Auto Detect.
- Các hàm Legacy: `updateAutoUnits`, `autoDiameterRange`, `boxBlurGray`, `robustAutoFit`, `detectInnerHoleCircles`, `applyAutoDetections`, `autoDetectCurrent`, `autoDetectAll`.
- Event listeners và cập nhật UI dành cho Legacy Auto Detect.
- Hướng dẫn người dùng liên quan Legacy Auto Detect.

## AI DETECT · YOLO sau thay đổi

- Trong bảng thuộc tính có nhóm **AI DETECT · YOLO** với nút **AI Detect · Ảnh này** và **AI Detect · Tất cả ảnh**.
- Giữ AI Engine status, vòng preview cyan, review required, Chấp nhận/Loại bỏ và Batch không tự chấp nhận.
- Kết quả AI được lưu `ai: true` (không gán `auto: true`), nên phân biệt rõ với dữ liệu Legacy cũ.
- Export CSV phân biệt `AI_YOLO_SEGMENTATION_CIRCLE_FIT` và `LEGACY_AUTO_INNER_EDGE_ROBUST_CIRCLE`.

## Kiểm thử đã chạy

| Kiểm thử | Kết quả |
|---|---|
| JavaScript syntax (`node --check`) | Pass |
| Quét tên Legacy UI/hàm/listener | Không còn tham chiếu |
| Audit DOM IDs | 83 tham chiếu đều có phần tử tĩnh hoặc được tạo động |
| Validate project cũ có `auto:true` | Pass; phép đo giữ nguyên |
| Validate project AI có `ai:true` | Pass; review state giữ nguyên |
| AI Engine `/model-info` | Model `hole_inner-2/weights/best.pt`, CUDA 0, `conf=.25`, `imgsz=640` |
| `/detect` | Ảnh dương: 3 detections; ảnh âm: 0 |
| `/detect-batch` | 2 responses, số detection `3,0`, tọa độ pixel gốc |

## Chưa thể click-test

Browser automation trong môi trường này không được phép mở trực tiếp file `file://` local. Vì vậy chưa click-test end-to-end các thao tác UI: AI Detect, AI Batch, calibration, manual measurement, Undo và Export. Chúng không bị sửa về logic trong lần này; cần smoke test thủ công trong trình duyệt trên máy trước khi dùng thường xuyên.

## Cách kiểm tra thủ công

1. Chạy `MicroCAD_AI\start_ai.ps1`.
2. Mở `MicroCAD_Vision.html`, tải một ảnh.
3. Xác nhận không có section/nút Legacy Auto Detect.
4. Trong **AI DETECT · YOLO**, chạy ảnh này, kiểm tra vòng cyan rồi Chấp nhận/Loại bỏ.
5. Bấm Undo sau Chấp nhận; thử calibration, phép đo tay, Export CSV/PNG/ZIP và mở lại một JSON project cũ.
