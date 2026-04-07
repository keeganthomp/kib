import { Architecture } from "@/components/architecture";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Nav } from "@/components/nav";
import { Quickstart } from "@/components/quickstart";

export default function Home() {
	return (
		<>
			<Nav />
			<main>
				<Hero />
				<Features />
				<Architecture />
				<Quickstart />
			</main>
			<Footer />
		</>
	);
}
