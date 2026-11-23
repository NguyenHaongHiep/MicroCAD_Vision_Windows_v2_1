# MicroCAD Vision + YOLO — launcher Windows 10/11

Nhánh `feat/one-click-ai-launcher` từ `47cf9ad` trên
`feat/image-navigation-multiselect`. Working tree ban đầu sạch. Nhánh visualization
mới hơn `feat/ai-detection-visualization` (`08a02af`) được bảo toàn riêng, không reset,
ghi đè hoặc merge vào công việc launcher. GitHub API Issue #4 bị Forbidden; đặc tả
được chủ dự án cung cấp trực tiếp.

## Chuẩn bị một lần trên máy Windows

1. Giữ nguyên thư mục ứng dụng ở một vị trí ổn định, có Edge hoặc Chrome.
   Thư mục có dấu cách/Unicode được hỗ trợ; script tự tìm đường dẫn theo vị trí file.
2. Máy Windows cần môi trường Python 3.11/3.12 đã chuẩn bị tại
   `MicroCAD_AI\.venv\Scripts\python.exe`. Nếu đã có, không chạy setup lại.
   Nếu chưa có, chạy `MicroCAD_AI\setup.ps1` riêng một lần theo README AI;
   `-CpuOnly` là lựa chọn thủ công nếu không dùng CUDA. Launcher không tự chạy setup,
   pip, cài Torch/CUDA, train hay download model.
3. Dùng checkpoint trained hiện có tại
   `MicroCAD_AI\runs\segment\hole_inner-2\weights\best.pt`, hoặc cấu hình
   `MICROCAD_MODEL` trỏ tới model cục bộ khác. Setup không tạo ra trained best.pt.
   `.venv` và checkpoint bị Git ignore; thiếu trong cloud không có nghĩa máy Windows
   của bạn thiếu các file này.
4. Nhấp đúp **TAO_SHORTCUT_DESKTOP.bat**. Nó gọi lại
   `Launch-MicroCAD.ps1 -CreateShortcut -ShortcutOnly`, tạo/cập nhật:
   - **MicroCAD Vision**: trỏ tới launcher PowerShell, không trỏ trực tiếp browser.
   - **Stop MicroCAD AI**: gọi launcher với `-StopAI`.
   Giữ nguyên vị trí thư mục sau khi tạo; nếu di chuyển, tạo shortcut lại.

## Sử dụng hằng ngày

Nhấp đúp **MicroCAD Vision** trên Desktop. Một cửa sổ tiến độ nhỏ hiện khi chờ AI;
không phải tự mở PowerShell hoặc nhập lệnh. Launcher kiểm tra Python/model và
`/health`, sau đó mở Edge/Chrome app-mode khi `model_ready=true`.

Cũng có thể nhấp đúp **START_MicroCAD.bat** có sẵn. Shortcut Desktop dùng
PowerShell hidden trực tiếp nên không cần cửa sổ console thường trực.

Nếu thiếu model/venv, load model lỗi, timeout hoặc port 8000 bị chiếm, thông báo
tiếng Việt nêu cách kiểm tra; sau khi đóng thông báo, giao diện vẫn mở để đo thủ
công. Không hiển thị AI ONLINE chỉ vì có tiến trình hoặc port mở. `-ManualOnly`
mở giao diện mà không thử khởi động AI; `-InspectOnly` chỉ in đường dẫn, không chạy.

Mỗi lần gọi launcher mở tối đa một cửa sổ app. Hai lần gọi có thể mở hai cửa sổ
browser; **backend vẫn chỉ một**. Không dò/kill các cửa sổ browser khác.

## Khởi động và dừng backend

- Launcher chạy `MicroCAD_AI/start_ai.ps1 -EnsureRunning` ở tiến trình con.
  Script gọi helper chuẩn-library `launcher.py`; chế độ foreground cũ của
  `start_ai.ps1` không tham số vẫn hoạt động.
- Khóa file startup dùng chung theo user/port ngăn hai launcher khởi động cùng lúc.
  Health đúng model và ready được tái sử dụng. Backend đang lỗi hoặc port của ứng
  dụng khác không bị thay thế/kill và không tạo thêm server.
- Helper mở `.venv` Python chạy uvicorn `server:app --host 127.0.0.1 --port 8000`.
  Chọn GPU/CUDA/device theo server và môi trường hiện có; không ép CPU hay cài CUDA.
- Launcher hiển thị giai đoạn kiểm tra Python, khởi động backend hoặc nạp model.
  `/health` trả trạng thái nạp model ngay khi HTTP sẵn sàng. Giới hạn mặc định
  vẫn là 90 giây. Nếu hết thời gian, thông báo cho biết đã có HTTP hay vẫn đang
  nạp model. Chế độ đo thủ công tiếp tục mở khi AI không sẵn sàng.
- Đóng browser **không tự tắt AI**, nhằm tái sử dụng ở lần mở sau. Để giải phóng
  RAM/GPU, nhấp đúp **Stop MicroCAD AI** hoặc **STOP_MicroCAD_AI.bat**. Bộ nhớ được
  hệ điều hành/driver thu hồi khi tiến trình đã thoát.
- Chỉ dừng backend do chính launcher trong thư mục này quản lý. Nếu tái sử dụng
  backend đã chạy thủ công/ứng dụng khác, Stop từ chối và yêu cầu dừng từ console
  gốc. Không taskkill theo tên Python, không kill server không xác minh được.

### Kiểm tra trạng thái AI

`/health` giữ `model_ready` và thêm `startup_state` (`loading`, `ready`,
`failed`), `error_code` và `parent_pid`. Windows có thể dùng tiến trình chuyển
tiếp `.venv/Scripts/python.exe`. Launcher chỉ nhận phiên mới khi `instance_id`
và PID hoặc PID cha khớp, sau đó lưu PID thật của backend. Lệnh Stop vẫn yêu
cầu đúng thư mục, PID và phiên khởi động trước khi dừng.

- `PYTHON`. Kiểm tra Python 3.11/3.12 mà `.venv/pyvenv.cfg` tham chiếu.
- `MODEL_MISSING` hoặc `MODEL_LOAD`. Kiểm tra đường dẫn và checkpoint đã huấn luyện.
- `DEPENDENCY` hoặc `CUDA`. Xem tên thư viện hoặc lỗi GPU trong thông báo và log.
  Có thể đặt `MICROCAD_DEVICE=cpu` khi chủ động chọn CPU.
- `PORT_IN_USE`. Xác định ứng dụng đang dùng 8000 và đóng từ ứng dụng gốc nếu cần.
- `BACKEND_EXIT`, `BACKEND_TIMEOUT` hoặc `MODEL_TIMEOUT`. Xem log để biết tiến
  trình đã thoát, chưa phản hồi HTTP hay còn nạp model tại thời điểm hết hạn.

Log/state lưu tại `%LOCALAPPDATA%\MicroCADVision`, ngoài checkout, không bị Git
track. `backend-8000.log` giữ output startup; wrapper log riêng cho từng lần gọi.
Không dump biến môi trường/credential hay log nội dung ảnh. Có đường dẫn cục bộ
trong thông báo để chẩn đoán. Có thể xóa log cũ khi AI đã dừng.

## Kết quả kiểm thử tự động

- **16/16 Python tests qua**: các test API/measurement cũ, metadata health, model
  thiếu, dependency thiếu, model khác, backend chưa ready, port conflict, startup
  thành công/exit/error/timeout, cleanup đúng child, stop từ chối chủ sở hữu sai,
  hai launcher đồng thời, đường dẫn có dấu cách/Unicode.
- Có test dùng child Python HTTP fixture thật trên localhost để kiểm tra polling,
  reuse và shutdown; không tải Torch/model trong fixture và không suy luận YOLO.
- PowerShell parser + mock flow qua: BOM, shortcut COM target/quoting, ensure/stop
  child, child thất bại, mở browser một lần, manual fallback khi thiếu venv,
  browser thiếu, inspect-only. Chạy bằng portable PowerShell 7.4.6 Linux đã xác minh
  SHA-256 từ release chính thức, không thêm dependency vào app.
- **44/44** UI/selection/measurement regressions qua; Node checks cũ và 7 ca hình
  học Row Spacing qua. HTML/CAD UI không có diff với baseline.
- Dùng lại test-only pacing 150 ms giữa burst download đã chẩn đoán ở nhánh
  visualization để tránh Chromium giới hạn >10 downloads/giây; không đổi export.

```powershell
# PowerShell tests không cần Pester; dùng mock, không khởi động YOLO thật:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\launcher.tests.ps1
cd MicroCAD_AI
.venv\Scripts\python.exe -m pytest -q
```

Các test portable/mock **không phải** kiểm thử tích hợp Windows 10/11, shortcut
COM thực, progress/MessageBox native hoặc GPU/driver thật. Cú pháp chủ đích tương
thích Windows PowerShell 5.1; các file PS tiếng Việt lưu UTF-8 BOM và wrapper đọc
log UTF-8. Cần thực hiện checklist Windows dưới đây trước khi xác nhận native.

## Checklist Windows thực tế

1. Thử tại thư mục có dấu cách và dấu, ví dụ `D:\Ứng dụng\MicroCAD Vision`.
   Chuẩn bị venv/model thật như trên; tạo shortcut, kiểm tra Target trỏ tới
   `powershell.exe ... -File "...\Launch-MicroCAD.ps1"`.
2. Double-click Desktop icon: progress → app window → AI ONLINE. Mở
   `http://127.0.0.1:8000/health`, xác nhận `model_ready:true`, đúng model_path và
   device dự kiến. AI Detect một ảnh, kiểm tra proposal/accept/calibration/Undo.
3. Double-click lại hoặc gọi hai lần đồng thời. Kiểm tra Task Manager/Process
   Explorer chỉ có một backend uvicorn; launcher reuse thay vì mở server thứ hai.
4. Đóng browser, chạy Stop shortcut. Kiểm tra backend thoát và RAM/GPU được thu hồi.
   Mở lại launcher: backend được khởi động lại và trở về ready.
5. Đổi tên tạm model/venv rồi chạy: thông báo rõ và mở manual, không cài/download.
   Khôi phục file sau test. Setup chỉ chạy riêng khi bạn chủ động muốn sửa môi trường.
6. Thử model lỗi và `-StartupTimeoutSeconds 1`: không báo ready giả; child do lần
   launch thất bại tạo ra được cleanup; xem log. Không dùng model đang cần cho công việc.
7. Dùng app khác chiếm 8000 hoặc backend thủ công: launcher không spawn trùng;
   Stop không kill backend không thuộc nó. Dừng fixture thủ công khi kết thúc test.

Không kết luận Windows của người dùng thiếu model từ môi trường cloud. Không
thay đổi model, datasets, camera permissions, UI CAD, phép đo hoặc định dạng export.
