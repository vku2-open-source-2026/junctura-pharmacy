<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Thành phần bên thứ ba

Junctura Pharmacy phát hành theo [Apache License 2.0](LICENSE). Tài liệu này liệt kê những gì dự án dùng nhưng không phải do dự án viết, kèm giấy phép. **Không có mã nguồn bên thứ ba nào được chép vào repo**: thư viện được khai trong `package.json` (gốc và `web/`), khóa phiên bản bằng `package-lock.json` và cài từ registry bằng `npm ci`.

Danh sách dưới đây lấy từ trường `license` trong lockfile, ở phiên bản hiện tại. Khi thêm hoặc nâng cấp thư viện, cập nhật lại tài liệu này.

## 1. Thành phần của hệ sinh thái Junctura

Cùng giấy phép Apache-2.0, do nhóm dự án phát hành.

| Gói | Phiên bản | Vai trò | Giấy phép |
| --- | --- | --- | --- |
| [`@junctura/server-client`](https://www.npmjs.com/package/@junctura/server-client) | 0.1.0 | SDK gọi Junctura Tầng 1 (gọi năng lực, kho bản ghi) | Apache-2.0 |
| [`@junctura/health-contracts`](https://www.npmjs.com/package/@junctura/health-contracts) | 1.1.0 | Hợp đồng năng lực dùng chung | Apache-2.0 |
| [`@junctura/health-ui`](https://www.npmjs.com/package/@junctura/health-ui) | 0.3.0 | Thư viện giao diện React dùng chung | Apache-2.0 |

Máy chủ Node.js không dùng thư viện ngoài nào khác ngoài hai gói Junctura đầu tiên.

## 2. Thư viện đi cùng bản build giao diện

Các gói này được đóng vào `web/dist` khi chạy `npm run build`.

| Gói | Phiên bản | Giấy phép | Dùng để |
| --- | --- | --- | --- |
| react, react-dom, scheduler | 19.3.1 / 19.3.1 / 0.28.0 | MIT | Dựng giao diện |
| lucide-react | 1.72.0 | ISC | Biểu tượng |
| jsqr | 1.4.0 | Apache-2.0 | Đọc mã QR từ camera khi trình duyệt không có `BarcodeDetector` |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | Phông chữ Inter |
| @fontsource-variable/jetbrains-mono | 5.3.0 | OFL-1.1 | Phông chữ JetBrains Mono |

**Phông chữ.** Inter và JetBrains Mono được phát hành theo [SIL Open Font License 1.1](https://openfontlicense.org/), cho phép dùng và phân phối kèm phần mềm. Phông được cài như thư viện npm và không bị sửa đổi.

## 3. Công cụ phát triển (không phân phối)

Chỉ dùng khi build và kiểm thử, không nằm trong sản phẩm chạy: TypeScript, Vite, Vitest, Testing Library, jsdom, Tailwind CSS, các công cụ đi kèm và phụ thuộc của chúng (242 gói).

| Giấy phép | Số gói |
| --- | --- |
| MIT | 208 |
| MPL-2.0 | 12 |
| ISC | 9 |
| Apache-2.0 | 6 |
| BSD-2-Clause, BSD-3-Clause | 2 + 2 |
| MIT-0, 0BSD | 1 + 1 |
| CC-BY-4.0 | 1 |

Các gói MPL-2.0 là công cụ biên dịch (như `lightningcss`), được dùng nguyên bản, không sửa và không đóng vào sản phẩm. Gói CC-BY-4.0 là dữ liệu trình duyệt hỗ trợ (`caniuse-lite`), chỉ dùng lúc build.

## 4. Dữ liệu

| Dữ liệu | Nguồn | Ghi chú |
| --- | --- | --- |
| Danh sách nhân viên nhà thuốc | `seed/data/accounts.json` của [junctura-health](https://github.com/vku2-open-source-2026/junctura-health) | **Giả lập hoàn toàn** |
| Kho thuốc mẫu (`npm run seed:stock`) | Danh mục thuốc dùng chung `seed/catalog.mjs` của junctura-health | Số lượng và hạn dùng do script tạo |
| Bảng nhóm dị ứng (`server/allergy-check.mjs`) | Danh sách ngắn do dự án tự soạn | Không phải tài liệu tra cứu chuyên môn |

Đơn thuốc và dị ứng của người bệnh không nằm trong repo: Pharmacy nhận chúng qua Junctura khi người bệnh đồng ý.
