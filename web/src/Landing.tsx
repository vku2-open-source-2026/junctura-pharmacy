// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, LandingPage, PreviewFrame, type LandingProps } from "@junctura/health-ui";
import { ClipboardCheck, FileCheck2, KeyRound, Lock, Pill, ScanLine, ShieldCheck, Store } from "lucide-react";

/** A small, honest picture of the verification screen: the feature is not built yet. */
const HeroPicture = () => (
  <PreviewFrame label="Minh hoạ khu vực xác minh đơn của Nhà thuốc" title="Pharmacy · Xác minh đơn">
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center">
        <Badge tone="warn">Đang xây dựng</Badge>
        <p className="mt-2 text-sm text-ink-2">Chức năng xác minh đơn thuốc đang được xây dựng.</p>
      </div>
      <div className="rounded-lg border border-line px-3 py-2 text-sm text-muted">
        Đơn thuốc và danh sách dị ứng sẽ đến từ Junctura; nhà thuốc không đọc thẳng hồ sơ.
      </div>
    </div>
  </PreviewFrame>
);

const SOURCE = "https://github.com/vku2-open-source-2026/junctura-pharmacy";

export const landingProps = (facility?: string): Omit<LandingProps, "onSignIn"> => ({
  product: "Pharmacy",
  badge: "Nhà thuốc",
  headline: "Xác minh đơn thuốc trong vài giây, cảnh báo dị ứng trước khi phát",
  lead: "Nhập hoặc quét mã đơn, xem đơn còn hợp lệ không và người bệnh có dị ứng nào. Dữ liệu đến từ bệnh viện và phòng khám qua Junctura, chỉ khi người bệnh đồng ý và đúng mục đích.",
  note: facility ? `${facility}. Dữ liệu trong bản demo là dữ liệu giả lập.` : "Dữ liệu trong bản demo là dữ liệu giả lập.",
  hero: <HeroPicture />,
  benefits: { title: "Đủ thông tin để phát thuốc an toàn", lead: "Thiết kế cho quầy thuốc đông người, thao tác nhanh và không bắt dược sĩ đọc cả hồ sơ.", items: [
    { icon: <ShieldCheck className="size-5" />, title: "Dị ứng hiện trước khi phát", text: "Danh sách dị ứng đi kèm đơn, lấy qua Junctura với mục đích phát thuốc." },
    { icon: <ScanLine className="size-5" />, title: "Xác minh trong vài giây", text: "Nhập hoặc quét mã đơn để biết đơn hợp lệ, còn hạn hay đã phát." },
    { icon: <Pill className="size-5" />, title: "Chỉ nhận dữ liệu cần thiết", text: "Không xem toàn bộ hồ sơ; chỉ đơn thuốc và dị ứng phục vụ việc phát thuốc." },
  ] },
  steps: { title: "Một đơn thuốc trong ba bước", items: [
    { title: "Nhập mã đơn", text: "Gõ hoặc quét mã đơn người bệnh đưa tới." },
    { title: "Xem kết quả", text: "Đơn hợp lệ hay không, thuốc trong đơn và cảnh báo dị ứng." },
    { title: "Phát thuốc", text: "Xác nhận từng dòng thuốc và lưu lần phát vào lịch sử." },
  ] },
  audiences: { title: "Dành cho quầy thuốc", items: [
    { icon: <Store className="size-5" />, title: "Dược sĩ tại quầy", text: "Một màn hình đủ để quyết định phát hay không phát." },
    { icon: <ClipboardCheck className="size-5" />, title: "Ca trực đông khách", text: "Thao tác ngắn, kết quả rõ, không phải ghi lại từ đầu." },
    { icon: <FileCheck2 className="size-5" />, title: "Bằng chứng khi cần", text: "Lịch sử các lần đã phát và đã từ chối, kèm lý do." },
  ] },
  trust: { title: "Riêng tư là mặc định", items: [
    { icon: <KeyRound className="size-5" />, title: "Đăng nhập qua Junctura", text: "Mật khẩu chỉ nhập trên trang của Junctura, Nhà thuốc không lưu mật khẩu." },
    { icon: <Lock className="size-5" />, title: "Không đọc thẳng hồ sơ", text: "Mọi trao đổi đi qua Junctura, chỉ khi người bệnh đồng ý và đúng mục đích." },
    { icon: <ShieldCheck className="size-5" />, title: "Mã nguồn mở", text: "Giấy phép Apache-2.0, kiểm tra được từng dòng." },
  ] },
  faq: { title: "Câu hỏi thường gặp", items: [
    { q: "Nhà thuốc có lưu hồ sơ người bệnh không?", a: "Không. Nhà thuốc chỉ nhận đơn thuốc và danh sách dị ứng cần cho việc phát thuốc." },
    { q: "Dữ liệu đơn đến từ đâu?", a: "Từ bệnh viện đã kê đơn, qua Junctura, khi người bệnh đồng ý." },
    { q: "Ai đăng nhập được?", a: "Chỉ tài khoản nhân viên nhà thuốc do đơn vị cấp trên Junctura." },
  ] },
  cta: { title: "Sẵn sàng cho ca trực hôm nay?", lead: "Đăng nhập bằng tài khoản Junctura của nhà thuốc." },
  footer: { links: [{ label: "Mã nguồn", href: SOURCE }, { label: "Báo lỗi", href: `${SOURCE}/issues` }, { label: "Giấy phép", href: "https://www.apache.org/licenses/LICENSE-2.0" }] },
});

export const Landing = ({ facility, onSignIn }: { facility?: string; onSignIn: () => void }) => <LandingPage {...landingProps(facility)} onSignIn={onSignIn} />;
