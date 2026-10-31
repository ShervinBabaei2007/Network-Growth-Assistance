import { MasterDetail } from "@/components/master-detail";

export default function ApplicationsLayout({ children, detail }: LayoutProps<"/applications">) {
  return <MasterDetail list={children} detail={detail} />;
}
