import { Footer } from "./Footer";
import { AnnouncementBar, Header } from "./Header";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnnouncementBar />
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
