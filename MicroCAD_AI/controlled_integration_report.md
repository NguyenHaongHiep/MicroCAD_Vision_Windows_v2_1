# Báo cáo tích hợp có kiểm soát — AI Experimental Mode

Ngày thực hiện: 2026-11-05  
Phạm vi: tích hợp thử nghiệm kỹ thuật, không phải phê duyệt đo lường hay production.

## Bảo toàn hệ thống

- Bản sao lưu trước khi sửa: `../backups/controlled_ai_before_20261105_123248/`.
- Checkpoint được dùng rõ ràng: `runs/segment/hole_inner-2/weights/best.pt`.
- Checkpoint cũ không bị ghi đè; HTML cũ, thuật toán Auto Detect cũ, calibration, Export, Undo và đo tay được giữ nguyên.
- Backend chỉ bind `127.0.0.1`; không có lệnh hay đường đi gửi ảnh ra dịch vụ ngoài.

## Thay đổi thực hiện

| Thành phần | Thay đổi |
|---|---|
| `server.py` | Load đúng một `HoleSegmenter` lúc startup; mặc định `conf=0.25`, `imgsz=640`; thêm `/health`, `/model-info`, giới hạn file/kích thước/timeout và CORS cho `file://` (`null`) cùng localhost. |
| `server.py` | `/detect` và `/detect-batch` trả kích thước, `coordinate_space=original_image_pixels`, tâm, bán kính, đường kính px, polygon mask/contour, confidence, fit error, coverage và `review_required`. |
| `start_ai.ps1` | Đặt đường dẫn checkpoint experimental rõ ràng và chỉ nghe localhost. |
| `MicroCAD_Vision.html` | Thêm **AI Detect · EXP**, **AI Batch · EXP**, overlay vòng cyan nét đứt, danh sách duyệt, Chấp nhận/Loại bỏ từng kết quả hoặc tất cả. |
| `MicroCAD_Vision.html` | Đề xuất AI giữ trong `aiPending`; chỉ Chấp nhận mới tạo phép đo. Undo khôi phục cả phép đo và đề xuất trước thao tác. |

## Kiểm thử đã chạy

| Kiểm thử | Kết quả thực tế |
|---|---|
| Cú pháp JavaScript HTML | Pass (`node --check`) |
| Cú pháp backend + pytest | Pass, 2 passed |
| `/health`, `/model-info` | Online, model mới đã load, CUDA device `0`, defaults `0.25/640` |
| `/detect`, ảnh test có nhiều lỗ | 3 detections, trường kết quả đầy đủ, tọa độ `original_image_pixels` |
| `/detect`, ảnh âm tính | 0 detections |
| `/detect-batch`, 1 ảnh dương + 1 âm | 2 response, số detection `3,0` |
| Backend dừng | HTTP health không kết nối được như dự kiến; cơ chế frontend chuyển AI về offline/disabled |
| Bộ kiểm thử model độc lập trước tích hợp | TP=6, FP=0, FN=0; mean Mask IoU=0.926; diameter MAE=1.61 px |
| Bộ nhớ backend | Một Python process; RSS 1,295 MB khi model đã load. Kiểm thử release trước đó: RSS ổn định khoảng 1.25 GB sau warm-up. |
| Canvas/original coordinates | Code vẽ overlay qua cùng phép biến đổi `screen()` mà phép đo tay dùng; API công bố `original_image_pixels`. Chưa đo được pixel-diff bằng browser automation vì trình duyệt thử nghiệm chặn mở `file://` local. |

Lần inference đầu sau khởi động đo được khoảng 3.8 s (warm-up/model initialization). Ảnh âm sau warm-up khoảng 22 ms. Số liệu release trước đó (33.48 ms/ảnh) mới là số đo steady-state đại diện hơn.

## Hành vi giao diện và fallback

1. AI Detect gửi đúng blob ảnh gốc; response bị từ chối nếu width/height không khớp ảnh đang mở.
2. Vòng xanh/cyan là đề xuất, không ghi đè measurement thủ công và không tự xác nhận.
3. Đường kính µm chỉ render khi `doc.cal` hợp lệ; mọi circle/fit được tính theo pixel ảnh gốc, không theo tọa độ Canvas.
4. Fit residual cao hoặc coverage thấp vẫn được trả `review_required=true`; confidence YOLO không được diễn giải là độ chính xác kích thước.
5. Khi `/health` không phản hồi, hai nút AI bị vô hiệu hóa và phần đo cũ vẫn không phụ thuộc backend.
6. AI Batch chỉ xếp đề xuất để duyệt, không tự tạo measurement.

## Hạn chế và việc chưa kiểm chứng

- Chưa có test set lớn, độc lập hoàn toàn theo phiên chụp; chưa đủ điều kiện production.
- Chưa có chuẩn đường kính theo µm, nên không thể xác nhận sai số đo thực tế µm.
- Chưa chạy thao tác click end-to-end bằng browser automation: công cụ thử nghiệm bị chặn mở URL `file://` local. Đã thay bằng kiểm tra cú pháp và API thật; cần người dùng thực hiện smoke test UI trên máy trước khi sử dụng thường xuyên.
- Cần bổ sung test thực tế cho lỗ méo/mép cháy/ánh sáng thay đổi, calibration và uncalibrated, Undo sau Accept, export sau Accept, cùng Auto Batch từ UI. Chức năng đã được thiết kế để các phép đo AI vẫn đi qua luồng Export và Undo hiện hữu, nhưng chưa được xác nhận bằng click UI trong phiên này.
- FastAPI cảnh báo `on_event` deprecation; không ảnh hưởng chức năng hiện tại, nhưng nên chuyển sang lifespan handler trước release rộng hơn.

## Cách chạy và dùng

```powershell
cd 'C:\Users\admin\Documents\App codex\MicroCAD_Vision_Windows_v2_1\MicroCAD_Vision_Windows_v2_1\MicroCAD_AI'
.\start_ai.ps1
```

Mở `MicroCAD_Vision.html`, tải ảnh, bấm **AI Detect · EXP**, kiểm tra vòng cyan và bảng review, sau đó chỉ **Chấp nhận** các lỗ phù hợp. Dùng Undo nếu cần bỏ thao tác chấp nhận. Để quay về phiên bản trước: dừng AI Engine rồi chép các file trong `../backups/controlled_ai_before_20261105_123248/` về vị trí tương ứng.
