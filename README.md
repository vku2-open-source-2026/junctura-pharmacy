<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Junctura Pharmacy

[![Checks](https://github.com/vku2-open-source-2026/junctura-pharmacy/actions/workflows/ci.yml/badge.svg)](https://github.com/vku2-open-source-2026/junctura-pharmacy/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![REUSE](https://img.shields.io/badge/REUSE-3.3-green.svg)](REUSE.toml)

**Junctura Pharmacy** là ứng dụng **nhà thuốc** trong [Junctura Health](https://github.com/vku2-open-source-2026/junctura-health), Tầng 2 của [Junctura DX-OS](https://github.com/vku2-open-source-2026/junctura-dxos). Nhà thuốc xác minh đơn thuốc và kiểm tra dị ứng trước khi phát thuốc; mọi dữ liệu người bệnh đến từ Junctura, chỉ khi người bệnh đồng ý và đúng mục đích.

> Trạng thái: đang xây dựng. Theo dõi tiến độ ở [Issues](https://github.com/vku2-open-source-2026/junctura-pharmacy/issues) và [CHANGELOG](CHANGELOG.md).

## Vai trò trong hệ thống

Pharmacy là **bên gọi** hai năng lực theo [hợp đồng dùng chung](https://github.com/vku2-open-source-2026/junctura-health/tree/main/contracts):

| Năng lực | Bên cung cấp | Mục đích | Cấp cứu |
| --- | --- | --- | --- |
| `prescription-verify` | Hospital | `dispensing` | Không |
| `allergy-list` | Clinic | `dispensing` | Có |

Pharmacy không gọi thẳng ứng dụng khác và không đọc database hay seed dữ liệu của ứng dụng khác; mọi trao đổi đi qua Junctura.

## Hiện có

- **Đăng nhập bằng Junctura** (OpenID Connect, PKCE): chỉ nhân viên nhà thuốc (tài khoản của ứng dụng này) xem được trang chủ; người khác nhận 403.
- Trang chủ hiển thị tên dược sĩ đang đăng nhập và nói rõ chức năng xác minh đơn thuốc đang được xây dựng.

Chưa có: xác minh đơn thuốc, phát thuốc và kho (xem [Issues](https://github.com/vku2-open-source-2026/junctura-pharmacy/issues)).

## Yêu cầu

- Node.js 24 (xem `.node-version`). Máy chủ chỉ dùng tính năng có từ Node 22.
- [junctura-dxos](https://github.com/vku2-open-source-2026/junctura-dxos) đang chạy và [junctura-health](https://github.com/vku2-open-source-2026/junctura-health) đã chạy `npm run demo:setup`. Cả hai nằm cạnh thư mục này; nếu ở nơi khác, đặt `JUNCTURA_HEALTH_DIR`.

## Build từ mã nguồn

```sh
git clone https://github.com/vku2-open-source-2026/junctura-pharmacy.git
cd junctura-pharmacy
npm run check
npm test                # kiểm thử máy chủ
npm run web:install     # cài thư viện giao diện từ lockfile
npm run web:test        # kiểm thử giao diện
npm run build           # build giao diện vào web/dist
```

## Chạy

```sh
npm start
```

Mở <http://localhost:5184> và đăng nhập bằng `duocsi.nhathuoc`. Mật khẩu demo nằm trong `.junctura/demo/accounts.env` của junctura-health. Máy chủ đọc thông tin kết nối từ `.junctura/demo/junctura-pharmacy.env` do `demo:setup` tạo (xem [`.env.example`](.env.example)); chạy mà thiếu thì nó báo rõ biến nào cần.

Khi sửa giao diện, chạy hai tiến trình: `npm run dev:server` (API ở cổng 5194) và `npm run dev` (giao diện ở cổng 5184, tự chuyển `/api` sang cổng 5194).

## Đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Báo lỗi và đề xuất ở [Issues](https://github.com/vku2-open-source-2026/junctura-pharmacy/issues).

## Giấy phép

Mã nguồn phát hành theo [Apache License 2.0](LICENSE); xem thêm [NOTICE](NOTICE). Mỗi file nguồn ghi giấy phép bằng header SPDX; file không ghi chú thích được (JSON, dữ liệu) được khai trong [REUSE.toml](REUSE.toml). Repo tuân thủ [REUSE 3.3](https://reuse.software/spec-3.3/).
