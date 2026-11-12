<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Chính sách bảo mật

Junctura Pharmacy nhận đơn thuốc và danh sách dị ứng của người bệnh (hiện là dữ liệu giả lập) và quyết định việc phát thuốc, nên lỗi bảo mật và lỗi an toàn được coi trọng hơn lỗi thông thường.

## Phiên bản được hỗ trợ

| Phiên bản | Hỗ trợ bản vá bảo mật |
| --- | --- |
| Nhánh `main` và bản phát hành mới nhất | Có |
| Bản cũ hơn | Không |

## Báo cáo lỗ hổng

**Vui lòng không mở Issue công khai cho lỗ hổng bảo mật.**

1. Vào tab **Security** của repo [junctura-pharmacy](https://github.com/vku2-open-source-2026/junctura-pharmacy/security) và chọn **Report a vulnerability** (báo cáo riêng tư của GitHub).
2. Nếu không dùng được cách trên, mở một Issue công khai chỉ ghi "cần báo cáo bảo mật" và **không** nêu chi tiết; người duy trì sẽ liên hệ lại để trao đổi riêng.

Nên kèm theo:

- Mô tả lỗ hổng và tác động (ai bị ảnh hưởng, dữ liệu nào lộ, thuốc có thể bị phát sai không).
- Các bước tái hiện, phiên bản hoặc commit.
- Đề xuất cách sửa, nếu có.

Nhóm là nhóm sinh viên nên không cam kết thời hạn cố định, nhưng sẽ cố gắng phản hồi trong vòng 7 ngày, thông báo hướng xử lý và ghi nhận người báo cáo (nếu họ đồng ý) khi phát hành bản vá.

## Phạm vi

**Trong phạm vi:** đăng nhập và kiểm tra vai trò dược sĩ; cách gọi năng lực qua Junctura (mục đích, người bệnh trong `context.dataSubject`, kiểm tra dữ liệu trả về theo hợp đồng); các kiểm tra trước khi phát thuốc (đơn hết hạn, đã phát, thuốc và số lượng không khớp, lô hết hạn hoặc thiếu hàng, thuốc trùng dị ứng); việc lộ mã người bệnh qua API, lịch sử hoặc nhật ký; xử lý đầu vào; lộ bí mật trong mã nguồn hoặc lịch sử git.

**Ngoài phạm vi:** lỗi chỉ xảy ra khi cố tình cấu hình thiếu an toàn (ví dụ để lộ `JUNCTURA_APP_CLIENT_SECRET`, tắt HTTPS ở môi trường công khai); tấn công từ chối dịch vụ bằng lưu lượng lớn; lỗi trong thư viện bên thứ ba chưa có bản sửa (hãy báo cho tác giả thư viện); dữ liệu mẫu (đều là giả lập, không có người thật).

**Lưu ý về cảnh báo dị ứng:** bảng nhóm dị ứng trong `server/allergy-check.mjs` là lưới an toàn, không phải cơ sở dữ liệu tương tác thuốc. Một trường hợp cảnh báo bị bỏ sót được coi là lỗi an toàn và nên báo như trên.

## Khi tự chạy ứng dụng

- Không commit `.env`, khóa, token; truyền thông tin kết nối Junctura bằng biến môi trường hoặc `--env-file`.
- Không đưa dữ liệu người bệnh thật vào môi trường thử nghiệm.
- Quét QR bằng camera chỉ chạy trên HTTPS hoặc localhost; khi mở ra mạng, đặt ứng dụng sau một reverse proxy có HTTPS.
