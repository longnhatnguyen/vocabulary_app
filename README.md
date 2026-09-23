# Vocabulary App - GitHub Pages

Bản này đã tách thành 3 file:

- `index.html`: cấu trúc giao diện
- `styles.css`: toàn bộ CSS
- `app.js`: logic ứng dụng + Firebase

## Cách đưa lên GitHub Pages

Đặt cả 3 file ở cùng một thư mục trong repository:

```text
/
├── index.html
├── styles.css
└── app.js
```

Sau đó commit + push như bình thường.

## Logic "Đã thuộc"

### Khi đang chọn một nội dung kiểm tra
Ví dụ chọn `Nghĩa`:

Một từ được xem là **Đã thuộc** nếu:
- được đánh dấu thủ công, HOẶC
- đã từng trả lời đúng `Nghĩa`.

### Khi chọn "Không kiểm tra"

Một từ được xem là **Đã thuộc** nếu:
- được đánh dấu thủ công, HOẶC
- đã từng trả lời đúng BẤT KỲ nội dung nào.

Vì vậy trạng thái không bị mất khi chuyển từ `Nghĩa` sang `Không kiểm tra`.

Checkbox `Đã thuộc` cũng luôn phản ánh cùng trạng thái với cột `Trạng thái`.

## Dữ liệu nhiều tài khoản

Local cache được tách theo Firebase UID:

```text
vocabulary_progress_v2_<uid>
vocabulary_manual_known_v2_<uid>
```

Do đó nếu tài khoản Google A đăng xuất rồi tài khoản B đăng nhập trên cùng trình duyệt,
hai tài khoản không dùng chung local progress.

Firestore vẫn lưu theo:

```text
users/{uid}/vocabulary/{wordId}
```

## Lưu ý về Firebase API key

Firebase Web API key vẫn phải xuất hiện trong JavaScript phía client.
GitHub Secret Scanning có thể cảnh báo Google API Key; đây không phải mật khẩu Firestore.
Quyền truy cập dữ liệu phải được bảo vệ bằng Firebase Authentication + Firestore Rules.
