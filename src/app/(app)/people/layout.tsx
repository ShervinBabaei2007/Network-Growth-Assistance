import { MasterDetail } from "@/components/master-detail";

export default function PeopleLayout({ children, detail }: LayoutProps<"/people">) {
  return <MasterDetail list={children} detail={detail} />;
}
