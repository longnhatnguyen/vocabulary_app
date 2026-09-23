# Vocabulary App - Sổ tay v2

Build: 20260923-2

## Quan trọng

Bản này đổi tên file JS/CSS để tránh browser/GitHub Pages dùng cache cũ:

- index.html
- styles.v2.css
- app.v2.js

Hãy upload/replace CẢ 3 file lên repo.

Sau deploy, phía trên giao diện sẽ có badge:

`Build 20260923-2`

Nếu không thấy badge này thì trình duyệt vẫn chưa tải đúng index mới.

## Sửa lỗi Lưu sổ

Sổ tay giờ được lưu theo thứ tự:

1. Lưu vào localStorage trước.
2. Cập nhật UI ngay.
3. Nếu đã đăng nhập Google thì mới đồng bộ Firestore.

Do đó Firestore lỗi hoặc mạng chập chờn không làm mất sổ vừa tạo.

## Firestore

Sổ tay:

users/{uid}/notebooks/{notebookId}
users/{uid}/notebooks/{notebookId}/chunks/{chunkId}

Tiến độ:

users/{uid}/vocabulary/{wordId}
