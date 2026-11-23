# Báo cáo kỹ thuật theo PDF tham chiếu

Trong **Report Editor**, chọn **Technical Quality Report** rồi chọn **Xuất PDF**. Trong hộp thoại in, chọn **Lưu dưới dạng PDF**, khổ A4 và tắt đầu trang/chân trang của trình duyệt nếu đang bật. Preview và PDF dùng cùng bố cục. Chọn **Kèm bảng truy xuất toàn bộ ảnh** để thêm các trang có tiêu đề bảng lặp lại. Trang truy xuất chính chọn tối đa tám ảnh theo cực trị, tỷ lệ không đạt và ảnh minh chứng đã chọn.

Bốn trang chính gồm tổng quan, đường kính, khoảng cách hai mép và truy xuất kèm ghi chú kỹ thuật. Báo cáo lấy thống kê gộp và tỷ lệ đạt từ các phép đo riêng lẻ đã hiệu chuẩn. Histogram và xu hướng dùng trung bình theo ảnh. Hạn dung sai có thể khác giữa các điều kiện. Khi không có một bộ giới hạn chung, báo cáo dùng dung sai áp dụng cho từng ảnh và bỏ đường giới hạn chung khỏi biểu đồ. Số đo edges thủ công được giữ riêng với circleGap.

| Tệp | Thay đổi |
|---|---|
| `analytics-report-data.js` | Chuẩn bị KPI, trung bình theo ảnh, cực trị, thứ tự ưu tiên truy xuất và hệ số hiệu chuẩn từ dữ liệu Analytics. |
| `analytics-report-technical.js`, `analytics-report-technical.css` | Bố cục bốn trang, phân trang phụ lục, bảng navy, KPI, dải dung sai và design tokens dùng chung. |
| `analytics-report-charts.js` | Biểu đồ vector riêng cho PDF kỹ thuật, dùng cùng font và bảng màu với trang báo cáo. |
| `analytics-report-export.js` | Chờ phông và ảnh minh chứng, sau đó in cùng bản xem trước bằng trình duyệt. |
| `analytics-report.js`, `analytics-workspace.js`, `analytics-session.js`, `analytics-workspace.css`, `MicroCAD_Vision.html` | Tích hợp template, trình xuất và tùy chọn truy xuất toàn bộ ảnh vào Report Editor. |
| `tests/analytics-browser.test.js` | Kiểm tra bốn trang mặc định, đánh số trang, phân trang bảng và tiêu đề lặp lại, cùng các bài thử hồi quy hiện có. |

Bản xuất nghiệm thu lấy 49 ảnh và 212 phép đo từ `MicroCAD_04-11-2026.zip` và `MicroCAD_04-11-2026 (1).zip`. Dự án kiểm thử được dựng từ các CSV đo và các PNG mà MicroCAD đã xuất trong hai ZIP, rồi mở qua tính năng mở JSON của ứng dụng. Các giá trị 112/155 đường kính đạt và 18/57 khe đạt được tính lại trong app. Bộ thô đã xác minh tương ứng với 49 ảnh gốc trong mẫu tham chiếu. Mẫu dùng cả 73 ảnh bổ sung nên số liệu, đồ thị và các ảnh được chọn để xem lại khác với bản xuất.

Cả hai PDF được render ở 160 DPI. Thư mục `output/pdf/DieuKien1_Pages` chứa bốn PNG đầu ra. Thư mục `output/pdf/DieuKien1_Comparison` chứa các cặp trang và ảnh sai khác pixel. Sai khác pixel bao gồm cả chữ và dữ liệu. PDF tham chiếu dùng Noto Sans, còn bản thử trên Windows nhúng Segoe UI do máy thử không có Noto Sans. Phần đầu trang của bản xuất dành dòng bên phải cho tên phần báo cáo. Ngày tạo được lấy lúc in.
