# Báo cáo chẩn đoán model MicroCAD_AI

Ngày chạy: 2026-11-05. Phạm vi: Phase A và Phase B. Không retrain, không thay đổi `best.pt`, không tích hợp model vào MicroCAD Vision.

## 1. Checkpoint và cấu hình đã xác minh

- Checkpoint: `runs/segment/hole_inner/weights/best.pt`
- SHA-256: `F0D296145205E90FD17FB5CF464737D9DCF48D9E400CEF4661D67C3AD50F75C6`
- Kích thước: 6,592,598 byte; best epoch 4; EarlyStopping epoch 16.
- Model: YOLO26n-seg, 2,703,783 parameters.
- Class mapping trong model và `data.yaml`: `0: hole_inner` — khớp nhau.
- Train: `imgsz=640`, batch 4, pretrained `yolo26n-seg.pt`, optimizer auto, AMP bật, mask ratio 4, NMS IoU 0.7.
- Ảnh gốc: 640×480. Letterbox 640 không thu nhỏ chiều ngang (`scale=1.0`), chỉ padding theo chiều dọc.
- `HoleSegmenter.predict()` nhận ảnh BGR từ OpenCV; Ultralytics hỗ trợ ndarray BGR. Mask được đưa về kích thước ảnh gốc trước circle fitting.
- API và frontend hiện gọi `conf=0.25`, `imgsz=1024`. Đây là mismatch so với train 640. Thử nghiệm bên dưới cho thấy 1024 làm false positives tăng, không giải quyết confidence thấp.
- `models/best.pt` không được tạo/ghi đè trong audit này; server vẫn chưa được phép dùng checkpoint prototype.

Nguồn cấu hình: `runs/segment/hole_inner/args.yaml`, `runs/last_train_config.json`, `results.csv`, `test_evaluation.json`, `train.py`, `evaluate.py`, `measure.py`, `server.py`.

## 2. Confidence sweep trên validation (không dùng test để chọn ngưỡng)

Đối sánh prediction–ground truth bằng mask IoU ≥ 0.5. Validation có 4 ảnh, 12 lỗ.

| Confidence | TP | FP | FN | Precision | Recall | F1 | IoU trung bình của TP |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.001 | 12 | 1187 | 0 | 0.010 | 1.000 | 0.020 | 0.882 |
| 0.010 | 12 | 212 | 0 | 0.054 | 1.000 | 0.102 | 0.853 |
| 0.050 | 2 | 0 | 10 | 1.000 | 0.167 | 0.286 | 0.897 |
| 0.100 | 0 | 0 | 12 | 0 | 0 | 0 | — |
| 0.150 | 0 | 0 | 12 | 0 | 0 | 0 | — |
| 0.250 | 0 | 0 | 12 | 0 | 0 | 0 | — |

Quét mịn trên validation cho `imgsz=640` cho F1 cao nhất tại **conf=0.04**: TP=4, FP=0, FN=8, precision=1.0, recall=0.333, F1=0.5. Đây chỉ là ngưỡng tốt nhất tương đối trong model hiện tại; recall 33.3% không đạt yêu cầu và **không phải ngưỡng vận hành hợp lệ**.

Ở `imgsz=1024`, điểm tốt nhất trong sweep là conf=0.03: TP=7, FP=70, FN=5, precision=0.091, recall=0.583, F1=0.157. Vì vậy API mặc định 1024 làm tình hình kém hơn. Tại 1024/conf=0.05: TP=0, FP=7, FN=12.

Train sweep cho cùng xu hướng: conf=0.01 cho TP=51, FP=911, FN=2; conf=0.05 cho TP=9, FP=0, FN=44; từ 0.10 trở lên không có detection. Model chưa đạt ngay cả trên train, nên đây không chỉ là overfit validation.

Chi tiết tái lập:

- `diagnosis/threshold_summary.csv`
- `diagnosis/threshold_per_image.csv`
- `diagnosis/fine_threshold_sweep.json`
- `diagnosis/predictions/{train,val}/conf_*`

## 3. Vì sao mAP50 tương đối cao nhưng conf=0.25 bằng 0

### Nguyên nhân có bằng chứng

1. **Confidence bị dồn rất thấp.** Trên validation ở conf=0.001, confidence lớn nhất chỉ 0.0686; trên train chỉ 0.0762. Do đó conf=0.10–0.25 chắc chắn loại toàn bộ prediction.
2. **Mask localization của prediction đúng lại tốt.** TP có mask IoU trung bình 0.85–0.90. Model đã học được hình dạng/mép lỗ ở một số proposal nhưng head phân loại/objectness không tách được lỗ khỏi nền.
3. **Rất nhiều proposal nền có confidence tương tự lỗ.** Ở conf=0.01, validation có 224 detection nhưng chỉ 12 TP. Ảnh overlay cho thấy mask lớn phủ texture vải.
4. **AP không phải hiệu năng tại một confidence cố định.** Ultralytics tính AP từ đường precision–recall khi quét/rank nhiều confidence. Một validation cực nhỏ vẫn có thể cho mask mAP50=0.567 dù tất cả score đều dưới 0.10 và không có ngưỡng cố định tốt.
5. **Validation quá nhỏ và cùng phiên chụp.** Chỉ 4 ảnh/12 lỗ; dao động một vài prediction làm mAP thay đổi mạnh.
6. **Thiếu negative/background trong train và validation.** Train: 18 ảnh/53 lỗ/0 ảnh âm tính. Validation: 4 ảnh/12 lỗ/0 ảnh âm tính. Model không được dạy đủ rằng texture vải không phải lỗ.
7. **Mẫu bố cục quá đồng nhất.** Hầu hết ảnh có ba lỗ ở vị trí tương tự, cùng camera/phiên chụp; model có thể học tương quan texture/bố cục thay vì khái niệm lỗ tổng quát.

Test mAP50=0.778 không được dùng để chọn threshold. Test chỉ có 3 ảnh, 6 lỗ và 1 ảnh âm tính, cùng phiên chụp, nên con số này có độ bất định rất cao.

### Giả thuyết chưa được kiểm chứng

- Pretrained YOLO26n-seg có thể cần nhiều dữ liệu/epoch hơn để hiệu chỉnh head một class chuyên biệt; chưa retrain nên chưa chứng minh.
- Augmentation mặc định (`scale=0.5`, mosaic, HSV mạnh) có thể quá mạnh cho 18 ảnh hiển vi; cần ablation sau khi có dataset tốt hơn.
- Nhãn ở lỗ sát mép có thể làm học khó hơn; hiện có 5/71 polygon chạm mép nhưng chưa đủ bằng chứng là nguyên nhân chính.

## 4. Dataset audit

| Split | Ảnh | Lỗ | Ảnh âm tính |
|---|---:|---:|---:|
| Train | 18 | 53 | 0 |
| Validation | 4 | 12 | 0 |
| Test | 3 | 6 | 1 |
| Tổng | 25 | 71 | 1 |

- Không thiếu ảnh/label, không label mồ côi.
- Class ID đều bằng 0; tọa độ đều trong [0,1].
- Không polygon dưới 3 điểm, diện tích 0 hoặc tự cắt.
- 5 polygon chạm mép ảnh; cần giữ nếu muốn nhận lỗ cắt biên nhưng phải đánh dấu riêng khi đánh giá đường kính.
- Không có file ảnh trùng SHA-256 giữa splits.
- Tuy nhiên toàn bộ tên ảnh cho thấy cùng chuỗi `WIN_20261104...`; khoảng cách dHash gần nhất giữa train/val là 18 và train/test là 21. Đây không chứng minh trùng ảnh, nhưng kết hợp cùng phiên và bố cục tương tự tạo **nguy cơ leakage theo phiên chụp cao**. Split hiện tại không đo được generalization sang phiên/ánh sáng/độ phóng đại khác.

### Phân bố kích thước lỗ

Equivalent diameter theo diện tích polygon:

- Min 94.69 px; P25 103.65 px; median 106.47 px; mean 106.89 px; P75 110.06 px; max 128.38 px.
- Ở input 640, ảnh 640×480 không bị thu nhỏ: đường kính vẫn 94.69–128.38 px.
- Với `mask_ratio=4`, đường kính trên mask grid khoảng 23.67–32.10 cell.

Kết luận: **lỗ không quá nhỏ tại imgsz=640**; tile ảnh hoặc tăng imgsz không phải ưu tiên. Thử 1024 thực tế còn tăng false positives.

### Công cụ và ảnh kiểm tra ground truth

- Script: `scripts/render_dataset_gt.py`
- Contact sheets: `diagnosis/ground_truth/train_contact_sheet.jpg`, `val_contact_sheet.jpg`, `test_contact_sheet.jpg`
- Ảnh từng split: `diagnosis/ground_truth/{train,val,test}/`

Màu polygon chỉ dùng để phân biệt instance; đường viền bám đúng vùng được gán nhãn.

## 5. Kết luận Phase A/B

- Class mapping, checkpoint và pipeline đọc ảnh không sai.
- Nguyên nhân trực tiếp của 0 detection tại conf=0.25 là mọi score <0.10.
- Không có confidence nào trên validation đạt đồng thời precision và recall chấp nhận được. `0.04` là F1 tốt nhất nhưng bỏ sót 8/12 lỗ.
- Mask đúng có hình học tốt; vấn đề chủ yếu nằm ở khả năng phân biệt foreground/background và calibration confidence do dữ liệu quá ít, thiếu negatives và split cùng phiên.
- `imgsz=640` phù hợp kích thước đối tượng; `imgsz=1024` không nên dùng để vá model hiện tại.
- Model hiện tại **không được tích hợp** vào MicroCAD Vision.

## 6. Kế hoạch cải thiện theo ưu tiên (chưa thực hiện)

1. **Sửa inference consistency:** khi model mới đạt yêu cầu, dùng cùng `imgsz=640` cho train/API; không hạ API xuống conf=0.01 vì sẽ tạo hàng chục FP/ảnh.
2. **Bổ sung negative/hard-negative:** ảnh vải không có lỗ, vùng cháy, mép vật liệu, ánh sáng chói, texture dễ nhầm; mục tiêu ban đầu ít nhất 20–30% ảnh train có label rỗng hoặc không chứa lỗ.
3. **Bổ sung dữ liệu theo nhóm:** thêm nhiều phiên chụp, ánh sáng, phóng đại, camera position và lỗ méo. Dành nguyên một phiên chưa từng train làm test.
4. **Cân bằng bố cục:** crop/ảnh có 1, 2, nhiều lỗ; lỗ ở vị trí khác nhau; không chỉ ba lỗ nằm ngang.
5. **QA nhãn:** tiếp tục dùng polygon mép trong; gắn cờ lỗ cắt biên và ảnh mơ hồ. Ground-truth hiện tại không có lỗi hình học tự động phát hiện.
6. **Retrain từ pretrained weights**, không fine-tune tiếp `best.pt` hiện tại: model hiện tại có head confidence lệch mạnh và dữ liệu mới sẽ thay đổi phân bố. Bắt đầu lại từ checkpoint segmentation pretrained nhỏ cho phép so sánh sạch.
7. **Ablation sau khi dữ liệu đủ:** train baseline 640; sau đó thử augmentation nhẹ hơn. Chỉ thử tile/imgsz cao hơn nếu thêm nhóm ảnh thật sự có lỗ nhỏ hơn nhiều; dataset hiện tại không cần.
8. **Tiêu chí trước tích hợp:** đánh giá theo session-held-out; báo precision/recall cố định, mask IoU và diameter MAE; chọn confidence chỉ trên validation, khóa threshold rồi chạy test đúng một lần.

## 7. Artifact

- Công cụ chẩn đoán: `diagnose_model.py`
- Báo cáo máy đọc: `diagnosis/diagnosis.json`
- Metrics theo threshold: `diagnosis/threshold_summary.csv`
- Metrics từng ảnh: `diagnosis/threshold_per_image.csv`
- Phân bố object: `diagnosis/object_sizes.csv`
- Audit ảnh: `diagnosis/dataset_images.csv`
- Fine sweep 640/1024: `diagnosis/fine_threshold_sweep.json`
- Prediction overlays: `diagnosis/predictions/`
- Ground-truth overlays: `diagnosis/ground_truth/`
