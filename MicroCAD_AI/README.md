# MicroCAD AI (offline)

Backend YOLO instance segmentation cục bộ cho MicroCAD Vision. Ảnh chỉ đi tới `127.0.0.1`; inference không tự tải model và không gửi ảnh ra Internet.

## Audit môi trường (2026-11-05)

- NVIDIA GeForce RTX 4060 Laptop GPU, 8188 MiB, driver 566.14, compute capability 8.9.
- Python 3.11 hoặc 3.12 đều được hỗ trợ. Python 3.12.10 phù hợp để tạo `.venv`.

## Cài Windows

1. Cài Python 3.11 hoặc 3.12 x64 từ python.org, bật `Add python.exe to PATH`.
2. PowerShell: `Set-ExecutionPolicy -Scope Process Bypass; .\setup.ps1`.
3. Chạy `.\start_ai.ps1`. Mặc định script dùng checkpoint thử nghiệm đã xác minh: `runs\segment\hole_inner-2\weights\best.pt` với `conf=0.25`, `imgsz=640`.
4. Kiểm tra `http://127.0.0.1:8000/health`.

## MicroCAD Vision — AI Experimental Mode

Mở `..\MicroCAD_Vision.html`, tải ảnh, rồi chọn **AI Detect · EXP**. Các vòng cyan là đề xuất tạm thời ở tọa độ pixel ảnh gốc; chỉ trở thành phép đo khi chọn **Chấp nhận**. Có thể **Loại bỏ** từng đề xuất hoặc tất cả. Nút **AI Batch · EXP** chỉ tạo đề xuất cho từng ảnh, không tự chấp nhận.

- Backend chỉ nghe tại `127.0.0.1`; ảnh không rời máy.
- Nếu AI Engine tắt, các tính năng đo thủ công và Auto Detect cũ vẫn hoạt động.
- Đường kính µm chỉ hiển thị khi ảnh đang có calibration hợp lệ.
- Đây là tích hợp kỹ thuật thử nghiệm, không phải xác nhận đo lường hoặc production release. Chi tiết: `controlled_integration_report.md`.

Setup cài cố định PyTorch 2.6.0 + torchvision 0.21.0 từ index CUDA 12.6 chính thức, phù hợp với driver 566.14 đã phát hiện; không cần cài CUDA Toolkit. Script dừng nếu CUDA vẫn không khả dụng. Chỉ dùng `.\setup.ps1 -CpuOnly` khi chủ động chấp nhận chạy CPU.

## Dataset

Trong CVAT, gán polygon đúng mép trong thật của lỗ, không gán bằng đường tròn xấp xỉ. Class duy nhất: `hole_inner`. Mỗi thư mục con trong `raw_images` nên là một phiên chụp/nhóm độc lập để tránh leakage.

```powershell
.venv\Scripts\python scripts\split_dataset.py --source raw_images
.venv\Scripts\python scripts\validate_dataset.py
.venv\Scripts\python scripts\preview_annotations.py IMAGE LABEL --output preview.png
```

## Train, evaluate, test

Checkpoint pretrained segmentation phải được xác minh với phiên bản Ultralytics vừa cài; truyền rõ ràng, script không phỏng đoán tên:

```powershell
.venv\Scripts\python train.py --model models\PRETRAINED_SEG.pt --epochs 100 --imgsz 1024 --batch -1
.venv\Scripts\python evaluate.py --model runs\segment\hole_inner\weights\best.pt --split test
.venv\Scripts\python -m pytest -q
```

`batch=-1` tự chọn theo VRAM. Chưa có model/dataset nhãn nên chưa có Precision, Recall, IoU hay diameter MAE thực nghiệm. YOLO confidence, circle fit error và measurement accuracy là ba đại lượng riêng biệt.
