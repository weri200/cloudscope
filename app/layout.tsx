import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Cloudscope Personal — 내 클라우드 사용량",description:"Google Cloud와 Firebase 사용량을 한눈에 확인하는 개인용 대시보드",icons:{icon:"/favicon.svg"},openGraph:{title:"Cloudscope Personal",description:"내 클라우드 사용량을 한눈에",images:["/og.png"]},twitter:{card:"summary_large_image",title:"Cloudscope Personal",description:"내 클라우드 사용량을 한눈에",images:["/og.png"]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
