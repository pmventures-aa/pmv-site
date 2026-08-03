import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { PageIntro, ServiceList } from '../../components/public/ui'
import { services } from '../../data/services'

export default function ServicesOverview() {
  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <PageIntro
          kicker="What we do"
          title="Services"
          subtitle="Professional support for businesses and property owners — pick a service below for details, or request service and we’ll help you map the right fit."
        />
        <div className="mt-12">
          <ServiceList items={services} />
        </div>
      </section>
      <Footer />
    </div>
  )
}
