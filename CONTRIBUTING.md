<!-- SPDX-FileCopyrightText: 2026 Junctura Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Đóng góp cho Junctura Pharmacy

## Quy trình

1. Mở hoặc nhận một Issue.
2. Tạo nhánh từ `main`: `feat/<việc>`, `fix/<việc>`, `docs/<việc>` hoặc `chore/<việc>`.
3. Commit theo [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
4. Trước khi push, chạy `npm run check`, `npm run check:reuse` và `npm test`.
5. Mở Pull Request vào `main`. Title viết tiếng Anh theo Conventional Commits, mô tả viết tiếng Việt theo mẫu. Cần CI xanh và một người khác duyệt.

## Quy tắc bắt buộc

- **Header SPDX ở đầu mọi file nguồn** (comment theo cú pháp của file):

  <!-- REUSE-IgnoreStart -->
  ```js
  // SPDX-FileCopyrightText: 2026 Junctura Contributors
  // SPDX-License-Identifier: Apache-2.0
  ```
  <!-- REUSE-IgnoreEnd -->

  File không ghi được chú thích (JSON, dữ liệu) thì khai trong `REUSE.toml`.
- **Không chép thư viện vào repo.** Khai báo trong `package.json` và commit lockfile; `node_modules/` không bao giờ được commit.
- **Không dùng dữ liệu người bệnh thật.** Dữ liệu người bệnh chỉ đến qua Junctura; không đọc thẳng seed của ứng dụng khác.
- **Không commit bí mật** (`.env`, khóa, token). Dùng `.env.example` để mô tả biến môi trường.
- Hợp đồng năng lực dùng chung nằm ở `junctura-health/contracts`; đổi hợp đồng phải sửa ở đó trước.
- Ghi thay đổi đáng chú ý vào mục `Unreleased` của `CHANGELOG.md`.
