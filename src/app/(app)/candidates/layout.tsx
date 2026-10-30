import { MasterDetail } from "@/components/master-detail";

export default function CandidatesLayout({ children, detail }: LayoutProps<"/candidates">) {
  return <MasterDetail list={children} detail={detail} />;
}
