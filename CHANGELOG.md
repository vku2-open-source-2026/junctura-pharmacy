<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Changelog

All notable changes to Junctura Pharmacy are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Khung ứng dụng: đăng nhập Junctura cho nhân viên nhà thuốc.
- Gọi năng lực `prescription-verify` và `allergy-list` qua Junctura.
- API xác minh đơn thuốc bằng QR hoặc mã đơn nhập tay, kèm kiểm tra dị ứng.
- API phát thuốc theo lô, từ chối có lý do và lịch sử lưu ở kho bản ghi của Junctura.
- Giao diện xác minh, hiển thị dị ứng, phát hoặc từ chối đơn và xem lịch sử.
- Dockerfile, `.dockerignore` và hướng dẫn chạy bằng Docker.
- Kho thuốc theo lô (sổ nhập, cảnh báo sắp hết và sắp hết hạn, nhập lô, `npm run seed:stock`).
- Nhật ký các lần gọi Junctura, không lưu thông tin người bệnh.

- Cảnh báo thuốc trùng dị ứng theo tên và nhóm dị ứng; phát thuốc trùng dị ứng phải ghi lý do.
- Trang Hôm nay; Landing đầy đủ; quét QR bằng camera (thêm `jsqr`); trạng thái rỗng có hướng dẫn.
- Chọn lô từ kho khi phát, hộp xác nhận trước khi phát; nhật ký thao tác; phiếu phát thuốc in được.
- Xuất hủy và kiểm kê kho, xem kho theo thuốc, tìm và lọc; báo cáo theo khoảng ngày và CSV; cài đặt ngưỡng kho.
- Tìm nhanh toàn cục; mã đơn hiển thị bằng IdChip.
- SECURITY.md, CODE_OF_CONDUCT.md, THIRD-PARTY.md.

### Fixed

- Không cho phát thuốc từ lô đã hết hạn.
