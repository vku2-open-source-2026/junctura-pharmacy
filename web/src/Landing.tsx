// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AlertBanner,
  AllergyStatus,
  Badge,
  ConsentBadge,
  IdChip,
  LandingPage,
  PreviewFrame,
  SourceBadge,
  type LandingProps,
} from "@junctura/health-ui";
import {
  Building2,
  EyeOff,
  FolderX,
  KeyRound,
  ScanLine,
  ScrollText,
  ShieldCheck,
  Store,
  UserCheck,
} from "lucide-react";

/** A small, fictional picture of the verification screen (no real patient data). */
const HeroPicture = () => (
  <PreviewFrame label="Minh hoạ màn hình xác minh đơn của Nhà thuốc, dữ liệu giả lập" title="Pharmacy · Xác minh đơn">
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="whitespace-nowrap" tone="brand">Dữ liệu giả lập</Badge>
        <IdChip value="DT-2026-004521" label="Đơn thuốc" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="whitespace-nowrap" tone="ok">Đơn hợp lệ</Badge>
        <Badge className="whitespace-nowrap" tone="neutral">Chưa phát</Badge>
        <ConsentBadge state="granted" />
      </div>
      <AlertBanner level="critical" title="Cảnh báo dị ứng Penicillin">
        Đơn có Amoxicillin. Kiểm tra với người bệnh trước khi phát.
      </AlertBanner>
      <AllergyStatus state="recorded" items={["Penicillin — phản ứng nặng"]} />
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source="Junctura" unit="Bệnh viện Đà Nẵng" />
        <SourceBadge source="Junctura" unit="Trạm Y tế Hoà Khánh Bắc" />
      </div>
      <p className="text-xs text-muted">Mã đơn và tên cơ sở là ví dụ; không có thông tin người thật.</p>
    </div>
  </PreviewFrame>
);

const SOURCE = "https://github.com/vku2-open-source-2026/junctura-pharmacy";
const HEALTH = "https://github.com/vku2-open-source-2026/junctura-health";

export const landingProps = (facility?: string): Omit<LandingProps, "onSignIn"> => ({
  product: "Pharmacy",
  badge: "Nhà thuốc",
  signInLabel: "Đăng nhập với Junctura",
  headline: "Xác minh đơn trong vài giây, cảnh báo dị ứng trước khi phát",
  lead: "Quét mã trên đơn hoặc nhập tay mã đơn và mã người bệnh để biết đơn còn hợp lệ không, đã phát chưa và người bệnh có dị ứng nào. Dữ liệu đến từ bệnh viện và trạm y tế qua Junctura, chỉ khi người bệnh đồng ý và đúng mục đích phát thuốc.",
  note: facility ? `${facility}. Dữ liệu là dữ liệu giả lập.` : "Dữ liệu là dữ liệu giả lập.",
  hero: <HeroPicture />,
  benefits: {
    title: "Ba việc quan trọng trước khi phát thuốc",
    lead: "Thiết kế cho quầy thuốc đông người: kết quả nhìn một lần là hiểu, nút to, ít phải nhập lại.",
    items: [
      {
        icon: <ScanLine className="size-5" />,
        title: "Xác minh đơn trong vài giây",
        text: "Quét mã trên đơn hoặc nhập tay mã đơn và mã người bệnh; biết ngay đơn hợp lệ không, còn hạn hay đã phát.",
      },
      {
        icon: <ShieldCheck className="size-5" />,
        title: "Cảnh báo dị ứng trước khi phát",
        text: "Danh sách dị ứng đi kèm đơn, lấy từ trạm y tế qua Junctura. Chưa ghi nhận không bao giờ bị hiểu là không dị ứng.",
      },
      {
        icon: <EyeOff className="size-5" />,
        title: "Không cần xem toàn bộ hồ sơ",
        text: "Chỉ nhận đơn thuốc và phần dị ứng cần cho việc phát thuốc; không đọc thẳng hồ sơ người bệnh.",
      },
    ],
  },
  steps: {
    title: "Một lần xác minh diễn ra thế nào",
    lead: "Junctura đứng giữa nhà thuốc và nơi giữ dữ liệu, nên mỗi lần hỏi đều có mục đích và dấu vết.",
    items: [
      {
        title: "Quét mã trên đơn",
        text: "Dùng camera của laptop hoặc điện thoại, máy quét mã QR (gõ như bàn phím), hoặc nhập tay mã đơn và mã người bệnh. Camera cần HTTPS hoặc localhost.",
      },
      {
        title: "Junctura kiểm tra đồng thuận",
        text: "Junctura xác định đúng người bệnh, đúng mục đích phát thuốc và ghi lại lần hỏi này.",
      },
      {
        title: "Bệnh viện, trạm y tế trả phần tối thiểu",
        text: "Bệnh viện trả tình trạng đơn; trạm y tế trả danh sách dị ứng. Chỉ phần cần cho việc phát thuốc.",
      },
      {
        title: "Phát hoặc từ chối",
        text: "Dược sĩ phát theo từng lô đã kiểm tra, hoặc từ chối kèm lý do; kết quả được lưu lại.",
      },
    ],
  },
  audiences: {
    title: "Dành cho ai",
    lead: "Một ứng dụng cho quầy thuốc, hoạt động cùng bệnh viện, trạm y tế và người bệnh qua Junctura.",
    items: [
      {
        icon: <Store className="size-5" />,
        title: "Dược sĩ tại quầy",
        text: "Xác minh đơn, xem dị ứng, phát hoặc từ chối; kho và lịch sử nằm trong cùng ứng dụng.",
      },
      {
        icon: <Building2 className="size-5" />,
        title: "Bệnh viện và trạm y tế",
        text: "Trả lời câu hỏi của nhà thuốc qua Junctura, không cần đăng nhập vào Pharmacy.",
      },
      {
        icon: <UserCheck className="size-5" />,
        title: "Người bệnh",
        text: "Quyết định có cho nhà thuốc xem dữ liệu hay không qua MyHealth; mọi lần xem đều có dấu vết.",
      },
    ],
  },
  trust: {
    title: "Bảo mật và riêng tư",
    lead: "Pharmacy chỉ hỏi đúng phần cần cho việc phát thuốc và không giữ hồ sơ người bệnh.",
    items: [
      {
        icon: <FolderX className="size-5" />,
        title: "Không giữ hồ sơ người bệnh",
        text: "Ứng dụng không có kho hồ sơ. Đơn và dị ứng chỉ đi qua khi người bệnh đã đồng ý cho mục đích phát thuốc.",
      },
      {
        icon: <ScrollText className="size-5" />,
        title: "Mọi lần hỏi có dấu vết",
        text: "Nhật ký ghi năng lực, mục đích, kết quả, đơn và dược sĩ; không lưu người bệnh, thuốc hay dị ứng.",
      },
      {
        icon: <KeyRound className="size-5" />,
        title: "Đăng nhập qua Junctura",
        text: "Mật khẩu chỉ nhập trên trang của Junctura; chỉ tài khoản dược sĩ của ứng dụng này vào được.",
      },
    ],
  },
  faq: {
    title: "Câu hỏi thường gặp",
    items: [
      {
        q: "Nhà thuốc có lưu hồ sơ người bệnh không?",
        a: "Không. Pharmacy không giữ hồ sơ; chỉ nhận đơn thuốc và danh sách dị ứng cần cho việc phát thuốc.",
      },
      {
        q: "Dữ liệu đơn và dị ứng đến từ đâu?",
        a: "Đơn từ bệnh viện đã kê, dị ứng từ trạm y tế, qua Junctura và chỉ khi người bệnh đồng ý cho mục đích phát thuốc.",
      },
      {
        q: "Chưa có đồng thuận thì ứng dụng hiện gì?",
        a: "Hiện rõ là người bệnh chưa đồng ý, không hiện như dữ liệu rỗng. Dược sĩ hỏi người bệnh trước khi phát.",
      },
      {
        q: "Danh sách dị ứng trống có nghĩa là không dị ứng?",
        a: "Không. Danh sách rỗng luôn là “chưa ghi nhận”. Không lấy được thông tin thì ứng dụng nhắc dược sĩ hỏi người bệnh.",
      },
      {
        q: "Có quét mã bằng camera điện thoại không?",
        a: "Có. Nhấn “Quét bằng camera” cạnh ô mã QR để dùng camera sau của laptop hoặc điện thoại; ứng dụng tự điền và xác minh khi đọc được mã. Camera chỉ dùng được trên HTTPS hoặc localhost.",
      },
    ],
  },
  cta: {
    title: "Sẵn sàng cho ca trực hôm nay?",
    lead: "Đăng nhập bằng tài khoản Junctura của nhà thuốc.",
  },
  footer: {
    links: [
      { label: "Mã nguồn", href: SOURCE },
      { label: "Junctura Health", href: HEALTH },
      { label: "Báo lỗi", href: `${SOURCE}/issues` },
      { label: "Giấy phép", href: "https://www.apache.org/licenses/LICENSE-2.0" },
    ],
    note: "Dữ liệu giả lập",
  },
});

export const Landing = ({ facility, onSignIn }: { facility?: string; onSignIn: () => void }) => <LandingPage {...landingProps(facility)} onSignIn={onSignIn} />;
