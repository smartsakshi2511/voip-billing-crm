import { Route } from "react-router-dom";
import OverviewPage from "../pages/ClientOverviewPage";
import ProductsPage from "../pages/ProductsPage";
import OrdersPage from "../pages/OrdersPage";
import UsersPage from "../pages/UsersPage";
import SettingsPage from "../pages/SettingsPage";
import ProfilePage from "../pages/ProfilePage";
import SIPAccountsList from "../components/users/SipUsers";
import DIDList from "../components/users/Did";
import DIDDestinationList from "../components/users/DidDestination";
import OnlineCallsList from "../components/users/CallsOnline";
import PlanPage from "../components/rate/Plan";
import CDRList from "../components/users/cdr";
import RoutesPage from "../components/users/Routepage";
import PlanGroupPage from "../components/rate/PlanGroup";
import TariffPage from "../components/rate/Tariff";
import RefillsPage from "../components/billing/refills";
import TrunkPage from "../components/billing/TrunkPage";
import SummaryPerDay from "../components/report/SummaryPerDay";
import SummaryPerMonth from "../components/report/SummaryPerMonth";
import SummaryOfTrunk from "../components/report/SummaryOfTrunk";
import RestrictedNumberPage from "../components/users/RestrictedNumberPage";
import LoadBalancePage from "../components/users/LoadBalancePage";
import DIDPurchasePage from "../components/did/DIDPurchasePage";


export default function clientRoutes() {
  return (
    <>
      <Route index element={<OverviewPage />} />
      <Route path="refills" element={<RefillsPage />} />
      <Route path="product" element={<ProductsPage />} />
      <Route path="users" element={<UsersPage />} />
      <Route path="orders" element={<OrdersPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path='settings' element={<SettingsPage />} />
      <Route path="callonline" element={<OnlineCallsList />} />
      <Route path="did" element={<DIDList />} />
      <Route path="diddestination" element={<DIDDestinationList />} />
      <Route path="routes" element={<RoutesPage />} />
      <Route path="cdr" element={<CDRList />} />
      <Route path="trunk" element={<TrunkPage />} />
      <Route path="sipuser" element={<SIPAccountsList />} />
      <Route path="plan" element={<PlanPage />} />
      <Route path="plangroup" element={<PlanGroupPage />} />
      <Route path="tariff" element={<TariffPage />} />
      <Route path="summaryperday" element={<SummaryPerDay />} />
      <Route path="summarypermonth" element={<SummaryPerMonth />} />
      <Route path="summaryoftrunk" element={<SummaryOfTrunk />} />
      <Route path="restrictednumberpage" element={<RestrictedNumberPage />} />
      <Route path="loadbalancepage" element={<LoadBalancePage />} />
            <Route path="didpurchase" element={<DIDPurchasePage/>} />

    </>
  );
}