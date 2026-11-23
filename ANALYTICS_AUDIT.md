# MicroCAD Analytics & Reports

Bản triển khai nằm trên nhánh `feat/analytics-reports`, dựa trên commit cục bộ `f2ba1bc` của `feat/one-click-ai-launcher`.

## Chạy trên Windows

Giữ `MicroCAD_Vision.html` và các tệp `analytics-*.js`, `analytics-workspace.css` cùng thư mục. Mở HTML bằng Microsoft Edge hoặc Chrome, hoặc mở qua `START_MicroCAD.bat` như trước. Analytics và xuất báo cáo hoạt động từ tệp cục bộ. Phần đo AI vẫn dùng dịch vụ AI cục bộ khi cần.

1. Mở dự án JSON hiện có hoặc nhập ảnh, hiệu chuẩn và đo trong **Measurement**.
2. Trong **Analytics**, chọn **Tạo điều kiện** để nhập thông tin dự án và điều kiện. Trong **Image Library**, chọn điều kiện, tạo phiên nếu cần, đánh dấu các ảnh và chọn **Gán ảnh đã chọn**. Khi chọn một điều kiện và phiên trong thư viện, ảnh nhập tiếp được gán theo lựa chọn đó. Ảnh cũ giữ trạng thái **Chưa gán điều kiện** cho đến khi bạn gán.
3. Chọn điều kiện, phiên, đặc tính và phương pháp trong **Analytics**. **Dung sai** sửa giới hạn của điều kiện đang chọn hoặc mặc định dự án khi chưa chọn một điều kiện cụ thể. Điều kiện có thể dùng lại dung sai dự án. Khe thủ công có bộ giới hạn riêng và để trống theo mặc định.
4. Trong xu hướng, dùng **Zoom +** và hai nút mũi tên để đổi vùng xem. Bấm điểm hoặc chọn dòng truy xuất để mở ảnh và phép đo. Điểm trung bình mở ảnh nguồn. Bấm **Lưu PNG** để lưu histogram đang xem.
5. Chọn **Generate Report**. Chọn **Quick Report** hoặc **Technical Quality Report**, điều chỉnh biểu đồ, tiêu đề, nguồn, ghi chú và ảnh minh chứng. Phạm vi báo cáo theo bộ lọc đang chọn trong Analytics.
6. Chọn **Xuất PDF** và trong hộp thoại in của Edge hoặc Chrome, chọn **Save as PDF / Lưu dưới dạng PDF**, khổ **A4**, tỷ lệ mặc định và tắt **Headers and footers** của trình duyệt nếu đang bật. Báo cáo đã có header, footer và số trang riêng. Chọn **Lưu cấu hình vào JSON** để lưu thiết lập cùng dự án.

**Bỏ ảnh đã chọn** chỉ loại ảnh khỏi dự án đang mở. **Hoàn tác bỏ ảnh** khôi phục lần bỏ ảnh gần nhất khi dự án còn mở.

## Kiến trúc và dữ liệu

| Tệp | Vai trò |
|---|---|
| `MicroCAD_Vision.html` | Thanh điều hướng, bố cục workspace, cầu nối với bộ ảnh và lựa chọn phép đo. `stashActive()` đồng bộ ảnh hiện hành, `activateImage()` mở lại ảnh nguồn. |
| `analytics-engine.js` | Chuẩn hóa các dòng đo; nhận trực tiếp `basePx()` từ ứng dụng. Tính thống kê và dung sai từ số thực trước khi định dạng. |
| `analytics-session.js` | Xác thực metadata tùy chọn, điều kiện, phiên, dung sai, cấu hình báo cáo và ánh xạ lại ID ảnh khi mở JSON. |
| `analytics-charts.js` | Histogram, trend, phân loại dung sai và so sánh điều kiện bằng SVG cục bộ. Xuất histogram PNG qua canvas. |
| `analytics-workspace.js`, `analytics-workspace.css` | Bộ lọc, KPI, truy xuất, điều hướng và trình biên tập. Dashboard dựng lại từ dữ liệu đo đang mở. |
| `analytics-report.js` | Tạo bản xem trước A4 và dùng cùng nội dung để in PDF. Mẫu kỹ thuật chia bảng theo số dòng và độ dài tên ảnh. |
| `tests/analytics-engine.test.js`, `tests/analytics-browser.test.js` | Kiểm thử thống kê và luồng tính năng trong trình duyệt. |

JSON dự án giữ phiên bản 3 và thêm trường tùy chọn `analytics`. JSON 1–3 có thể mở khi thiếu trường này. Tên ảnh, ID phép đo, phương pháp, hệ số và ảnh chuẩn truy xuất trực tiếp từ phép đo và ảnh. Mỗi đường kính, `circleGap`, `edges` và đại lượng chiều dài khác giữ nhóm riêng. KPI tổng phép đo gồm cả góc. Thống kê mm và báo cáo kích thước dùng phép đo chiều dài. Dữ liệu px vẫn truy xuất được và không có kết quả dung sai mm. `makeCSV()`, `exportAll()` và các công thức hình học dùng luồng hiện có.

Khi gộp nhiều điều kiện, mỗi phép đo được đánh giá bằng dung sai áp dụng cho ảnh của nó. Histogram phân màu theo kết quả từng phép đo. Các đường LSL, Target và USL chỉ xuất hiện nếu giới hạn của các nhóm trong biểu đồ trùng nhau. Hai giới hạn được tính bao gồm biên. Tỷ lệ đạt dùng mẫu số là số phép đo đã hiệu chuẩn và có dung sai phù hợp.

## Kiểm thử và đối chiếu

- Chạy `node tests/analytics-engine.test.js`, `node KIEM_THU_CAP_NHAT.js`, `node MicroCAD_AI/tests/test_row_spacing.js` và `powershell -ExecutionPolicy Bypass -File tests/launcher.tests.ps1`.
- Chạy `node tests/analytics-browser.test.js` với Playwright và trình duyệt Chromium có sẵn. Nếu cần, đặt `PLAYWRIGHT_PACKAGE` tới gói Playwright cục bộ, `MICROCAD_BROWSER` tới đường dẫn trình duyệt và `MICROCAD_QA_OUTPUT` tới thư mục có sẵn ba thư mục con `pdf`, `screenshots` và `qa` để tạo lại ảnh chụp và PDF.
- Hai PDF bàn giao lấy phép đo từ `VI_DU_DUONG_KINH_VA_MEP.json` trong repository. Tệp có một ảnh, hai phép đo đường kính và một phép đo khe. Tên điều kiện và phiên đánh dấu mục đích kiểm thử, không chứa thông số laser giả. Kiểm thử phân trang dùng 46 bản sao của ảnh mẫu với tên dài và không dùng bộ này làm PDF mẫu bàn giao.
- PDF đối chiếu tìm được mang tên `Báo cáo điều kiện 1 - dữ liệu mới.pdf`. Trang đầu mô tả 49 ảnh và 212 phép đo. Số này khác mốc 122 ảnh / 508 dòng trong yêu cầu. Chưa có các dòng đo gốc của bộ 508 để tính lại và xác nhận. Không tìm thấy `MicroCAD_Analytics_Report_Mau_DieuKien1.pdf`. Mẫu kỹ thuật lấy hướng bố cục và phối màu từ báo cáo đối chiếu có sẵn.

## Giới hạn

- PDF được lưu qua hộp thoại in của trình duyệt. Histograms và các biểu đồ báo cáo dùng mm. Trend dùng thứ tự ảnh vì JSON cũ không có thời điểm đo đáng tin cậy.
- Dự án chỉ lưu hệ số hiện hành trên từng ảnh. Hệ số lịch sử riêng cho từng phép đo không thể suy ra từ JSON cũ. Các phép thử không thay đổi cách MicroCAD áp dụng hiệu chuẩn hiện tại.
- Ảnh minh chứng là ảnh gốc. Mẫu Quick hiển thị tối đa ba biểu đồ và biểu đồ so sánh của mẫu này hiển thị tối đa sáu điều kiện đầu tiên. Mẫu Technical phân trang các nhóm so sánh. Bảng truy xuất trong dashboard giới hạn 300 dòng cho bộ lọc đang chọn. Bảng truy xuất trong PDF kỹ thuật tổng hợp theo ảnh và phân trang.
- Kiểm thử tích hợp dùng camera mô phỏng và phản hồi AI mô phỏng. Mô hình YOLO và camera USB vật lý cần kiểm tra với thiết bị thật. Bộ pytest của AI cần môi trường Python có các phụ thuộc của dự án. Môi trường cũ tham chiếu Python 3.12 không có trên máy kiểm thử.
- Chưa xác nhận được commit mới nhất trên GitHub qua remote trong môi trường hiện tại.
