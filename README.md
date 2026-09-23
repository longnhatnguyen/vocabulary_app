# Vocabulary App - Bản có Sổ tay

Bộ mã gồm:

- `index.html`
- `styles.css`
- `app.js`

## Chức năng Sổ tay mới

1. Người dùng import Excel.
2. App tự gợi ý tên sổ từ tên file.
3. Người dùng nhập/sửa tên, ví dụ `HSK 1 - Bài 1`.
4. Bấm `Lưu sổ`.
5. Lần sau mở app chỉ cần chọn sổ ở `Chọn sổ để học`, không phải upload Excel lại.

### Khi đã đăng nhập Google

Sổ tay được lưu lên Firestore:

```text
users/{uid}/notebooks/{notebookId}
users/{uid}/notebooks/{notebookId}/chunks/{chunkId}
```

Từ vựng được chia thành các chunk để:
- không vượt giới hạn 1 MiB/document của Firestore;
- giảm số document reads so với mô hình mỗi từ = 1 document.

### Khi chưa đăng nhập

Sổ tay vẫn có thể lưu trong `localStorage` của trình duyệt.

## Tiến độ học

Tiến độ từ vẫn được lưu riêng như trước:

```text
users/{uid}/vocabulary/{wordId}
```

Một từ là `Đã thuộc` nếu:
- đánh dấu thủ công, hoặc
- đã từng trả lời đúng.

Khi chọn `Không kiểm tra`, trạng thái tổng hợp từ mọi loại bài kiểm tra.

## Deploy GitHub Pages

Đặt 3 file này cùng cấp trong repo:

```text
/
├── index.html
├── styles.css
└── app.js
```

Commit + push lên GitHub là được.
