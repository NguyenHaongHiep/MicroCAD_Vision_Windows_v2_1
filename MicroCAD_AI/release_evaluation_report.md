# Báo cáo kiểm thử model `hole_inner-2`

Ngày chạy: 2026-11-05. Không retrain, không thay đổi checkpoint cũ, không sửa hoặc tích hợp vào MicroCAD Vision HTML.

## 1. Cấu hình cố định

- Model mới: `runs/segment/hole_inner-2/weights/best.pt`
- SHA-256 mới: `747649FFB8AC395A6F79753444DA3E1ED79E7EE22E1EB3D3E24DDB47C24A18FD`
- Model cũ: `runs/segment/hole_inner/weights/best.pt`
- SHA-256 cũ: `F0D296145205E90FD17FB5CF464737D9DCF48D9E400CEF4661D67C3AD50F75C6`
- Class mapping cả hai: `0: hole_inner`
- Inference: `conf=0.25`, `imgsz=640`, NMS IoU 0.7, CUDA device 0, retina masks bật.
- Đối sánh TP: mask IoU ≥ 0.5.
- Không quét/chọn threshold trên test.

## 2. Tính độc lập của test

Test có 3 file không nằm trong train hoặc validation: 2 ảnh dương với 6 lỗ và 1 ảnh âm tính. Các file này không được dùng để train hoặc chọn hyperparameters của run mới.

Tuy nhiên đây **chưa phải test độc lập theo phiên chụp**: tên file test `WIN_20261104_17_24_*` cùng chuỗi thời gian/điều kiện với một phần ảnh train cũ `WIN_20261104_17_24_*`. Vì vậy kết quả chỉ là file-level holdout, có nguy cơ session leakage. Chưa được dùng để tuyên bố generalization.

## 3. Kết quả định lượng

| Chỉ số | Model mới | Model cũ |
|---|---:|---:|
| Ground truth instances | 6 | 6 |
| TP | 6 | 0 |
| FP | 0 | 0 |
| FN | 0 | 6 |
| Precision | 1.000 | 0 |
| Recall | 1.000 | 0 |
| False positives/image | 0.000 | 0.000 |
| Mean mask IoU | 0.926 | — |
| Median mask IoU | 0.933 | — |

Confidence sáu prediction mới nằm khoảng 0.909–0.936. Mask IoU từng lỗ nằm khoảng 0.894–0.946. Model cũ không tạo detection nào tại cùng cấu hình.

### Theo từng ảnh

| Ảnh | GT | Detection | TP | FP | FN | Ghi chú |
|---|---:|---:|---:|---:|---:|---|
| `WIN_20261104_17_24_10_Pro.jpg` | 3 | 3 | 3 | 0 | 0 | Ba lỗ, mép cháy sáng, hình dạng không hoàn toàn tròn |
| `WIN_20261104_17_24_41_Pro.jpg` | 3 | 3 | 3 | 0 | 0 | Góc/ánh sáng và mép vật liệu khác ảnh trên |
| `WIN_20261104_17_34_43_Pro.jpg` | 0 | 0 | 0 | 0 | 0 | Ảnh âm tính là thước chuẩn với nhiều vạch đen |

Ảnh âm tính thước chuẩn là hard-negative hữu ích, nhưng chỉ một ảnh âm tính độc lập là không đủ đánh giá false-positive rate tổng quát. Mười hai ảnh negative mới đã nằm trong train nên không được dùng làm independent test.

## 4. Mask sang đường tròn

Đường tròn tham chiếu được robust-fit từ polygon ground truth. Đường tròn prediction đi qua đúng pipeline `mask_to_measurement()` (contour, RANSAC, least squares).

- Diameter MAE: **1.61 px**.
- Diameter max absolute error: **3.81 px**.
- Mean center error: **2.45 px**.
- Mean predicted circle fit error: **1.35 px**.
- Các circle overlay bám mép trong tốt trên sáu lỗ.

Sai số theo từng lỗ (px): diameter 0.85, 3.81, 1.27, 1.09, 0.56, 2.07. Một lỗ có center error 6.52 px do hình dạng méo; các lỗ còn lại khoảng 0.56–2.65 px.

Không báo cáo sai số µm vì test dataset không chứa calibration hoặc đường kính tham chiếu vật lý. Diameter error ở đây là chênh lệch với circle-fit từ nhãn polygon, không phải sai số metrology so với chuẩn đo độc lập.

## 5. RAM, GPU memory và tiến trình

- Máy có khoảng 16,089 MB RAM; sau khi evaluator thoát còn khoảng 4,264 MB free, used 73.5%.
- Process Python sau warm-up dùng khoảng 1,254 MB RSS.
- Stress 100 inference: RSS tăng khoảng 5.03 MB ở 10 lượt đầu rồi ổn định 1,258.82 → 1,258.95 MB từ lượt 10 đến 100.
- GPU memory ổn định: allocated 43.3 MB, reserved 90 MB.
- Sau khi tiến trình stress thoát: **không còn process Python/pythonw**. RAM/GPU của process được hệ điều hành thu hồi.
- Trong một server Python dài hạn, PyTorch giữ cache/RSS khoảng 1.25 GB; đây là hành vi cache ổn định, không có bằng chứng memory leak qua 100 inference.

Latency:

- Lần đầu của evaluator có overhead khởi tạo CUDA/model, nên không dùng làm latency steady-state.
- Sau warm-up: trung bình 33.48 ms/ảnh, min 22.75 ms, max 93.67 ms trên RTX 4060 Laptop.

## 6. Kiểm tra trực quan

- `release_evaluation/new/WIN_20261104_17_24_10_Pro.jpg`
- `release_evaluation/new/WIN_20261104_17_24_41_Pro.jpg`
- `release_evaluation/new/WIN_20261104_17_34_43_Pro.jpg`
- `release_evaluation/old/` chứa overlay model cũ.
- `release_evaluation/per_image.csv` chứa confidence, IoU và circle metrics từng ảnh.
- `release_evaluation/summary.json` chứa metrics, hash và memory measurements.

Màu xanh/cyan thể hiện mask/circle prediction, ground truth được phủ màu; header ghi TP/FP/FN.

## 7. Đánh giá mức sẵn sàng

### Đã đạt

- Cấu hình inference mục tiêu `conf=0.25`, `imgsz=640` hoạt động.
- 6/6 lỗ được phát hiện, không FP/FN trên file-level test.
- Mask IoU và circle-fit tốt hơn rõ rệt so với model cũ.
- Ảnh âm tính thước chuẩn không bị nhận nhầm.
- Bộ nhớ ổn định qua 100 inference và không còn process Python sau khi kết thúc.

### Chưa đạt/chưa chứng minh

- Chưa có test từ phiên chụp hoàn toàn độc lập.
- Chỉ có 2 ảnh dương và 1 ảnh âm tính test.
- Chưa đủ mẫu riêng cho ánh sáng khác mạnh, độ phóng đại khác, nhiều dạng lỗ méo, lỗ sát mép ảnh, vùng cháy nặng và microscope negatives.
- Chưa có đường kính chuẩn vật lý/calibration để tính MAE µm.

## 8. Kết luận

Model mới **đủ điều kiện cho thử nghiệm tích hợp kỹ thuật có kiểm soát** (engine riêng, giữ manual fallback, mọi kết quả AI phải review), vì đã vượt model cũ rõ rệt và pipeline mask→circle hoạt động.

Model **chưa đủ điều kiện tích hợp chính thức/production hoặc tự động chấp nhận kết quả**, vì test hiện tại không độc lập theo phiên và kích thước mẫu quá nhỏ. Trước khi đưa vào workflow chính, cần khóa một tập test mới từ phiên chụp khác, tối thiểu gồm positive, microscope negative, lỗ méo, cháy nặng, sát biên, ánh sáng và phóng đại khác; threshold vẫn giữ 0.25, không tối ưu trên tập đó.
