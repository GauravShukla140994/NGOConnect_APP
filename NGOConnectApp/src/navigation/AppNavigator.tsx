import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AppConfig from '../config/AppConfig';

// ── Tab screens ───────────────────────────────────────────────────────────────
import HomeScreen          from '../screens/home/HomeScreen';
import ExploreScreen       from '../screens/ngo/ExploreScreen';
import ImpactScreen        from '../screens/profile/ImpactScreen';
import CommunityScreen     from '../screens/community/CommunityScreen';
import ProfileScreen       from '../screens/profile/ProfileScreen';

// ── Stack screens ─────────────────────────────────────────────────────────────
import NotificationsScreen from '../screens/home/NotificationsScreen';
import FCMTestScreen       from '../screens/home/FCMTestScreen';
import NgoProfileScreen    from '../screens/ngo/NgoProfileScreen';
import ProjectDetailScreen from '../screens/volunteer/ProjectDetailScreen';
import JoinFormScreen      from '../screens/ngo/JoinFormScreen';
import MyProjectsScreen    from '../screens/volunteer/MyProjectsScreen';
import AllOpportunitiesScreen from '../screens/volunteer/AllOpportunitiesScreen';
import EditProfileScreen   from '../screens/profile/EditProfileScreen';
import MyOrgsScreen        from '../screens/ngo/MyOrgsScreen';
import CreateOrgScreen     from '../screens/ngo/CreateOrgScreen';
import DonateScreen        from '../screens/donations/DonateScreen';
import DonationPaymentScreen from '../screens/donations/DonationPaymentScreen';
import DonationSuccessScreen from '../screens/donations/DonationSuccessScreen';
import MyDonationsScreen   from '../screens/donations/MyDonationsScreen';
import SosTriggerScreen    from '../screens/sos/SosTriggerScreen';
import SosActiveScreen     from '../screens/sos/SosActiveScreen';
import SosResolvedScreen   from '../screens/sos/SosResolvedScreen';
import LiveLocationScreen  from '../screens/sos/LiveLocationScreen';
import AdminNavigator      from './AdminNavigator';
import AdminProjectsScreen       from '../screens/admin/AdminProjectsScreen';
import AdminProjectDetailScreen  from '../screens/admin/AdminProjectDetailScreen';
import CreateProjectScreen       from '../screens/admin/CreateProjectScreen';
import ParticipantsScreen        from '../screens/admin/ParticipantsScreen';
import AdminVolunteersScreen from '../screens/admin/AdminVolunteersScreen';
import AdminCommunityScreen  from '../screens/admin/AdminCommunityScreen';
import AdminDonationsScreen  from '../screens/admin/AdminDonationsScreen';
import AdminCampaignsScreen  from '../screens/admin/AdminCampaignsScreen';
import AdminDonorsScreen     from '../screens/admin/AdminDonorsScreen';
import AdminTransactionsScreen from '../screens/admin/AdminTransactionsScreen';
import AdminWithdrawalScreen   from '../screens/admin/AdminWithdrawalScreen';
import AdminOrgScreen          from '../screens/admin/AdminOrgScreen';
import VolunteerProfileScreen  from '../screens/admin/VolunteerProfileScreen';
import MemberImpactScreen      from '../screens/admin/MemberImpactScreen';
import InviteMembersScreen     from '../screens/admin/InviteMembersScreen';
import InviteAcceptScreen     from '../screens/invite/InviteAcceptScreen';
import WebViewScreen                   from '../screens/common/WebViewScreen';
import HelpSupportScreen               from '../screens/profile/HelpSupportScreen';
import CommunicationPreferencesScreen  from '../screens/profile/CommunicationPreferencesScreen';
import SavedPostsScreen                from '../screens/profile/SavedPostsScreen';
import AllBadgesScreen                 from '../screens/profile/AllBadgesScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const C     = AppConfig.COLORS;

// ─────────────────────────────────────────────────────────────────────────────
// TabIcon — emoji icons, render natively on Android without any extra package
// Matches prototype tab labels: Home / Explore / Impact / Community / Profile
// ─────────────────────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  Home:      '🏠',
  Explore:   '🔍',
  Impact:    '📊',
  Community: '👥',
  Profile:   '👤',
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={tabStyles.wrap}>
      <Text style={[tabStyles.icon, focused && tabStyles.iconOn]}>{ICONS[name] ?? '●'}</Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  wrap:    { alignItems: 'center', justifyContent: 'center' },
  icon:    { fontSize: 21, opacity: 0.45 },
  iconOn:  { opacity: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Volunteer Tabs — Home / Explore / Impact / Community / Profile
// Matches prototype .bnav with 5 items exactly
// ─────────────────────────────────────────────────────────────────────────────
const VolunteerTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor:   C.PRIMARY,
      tabBarInactiveTintColor: C.TEXT2,
      tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      tabBarLabelStyle: {
        fontSize:     9,
        fontWeight:   '600',
        marginTop:    -2,
        marginBottom: 2,
      },
      tabBarStyle: {
        backgroundColor: C.CARD,
        borderTopColor:  C.BORDER,
        borderTopWidth:  1,
        paddingTop:      6,
        elevation:       8,
        shadowColor:     '#000',
        shadowOffset:    { width: 0, height: -2 },
        shadowOpacity:   0.08,
        shadowRadius:    6,
      },
    })}>
    <Tab.Screen name="Home"      component={HomeScreen}      options={{ tabBarLabel: 'Home'      }} />
    <Tab.Screen name="Explore"   component={ExploreScreen}   options={{ tabBarLabel: 'Explore'   }} />
    <Tab.Screen name="Impact"    component={ImpactScreen}    options={{ tabBarLabel: 'Impact'    }} />
    <Tab.Screen name="Community" component={CommunityScreen} options={{ tabBarLabel: 'Community' }} />
    <Tab.Screen name="Profile"   component={ProfileScreen}   options={{ tabBarLabel: 'Profile'   }} />
  </Tab.Navigator>
);

// ─────────────────────────────────────────────────────────────────────────────
// Full App Stack
// ─────────────────────────────────────────────────────────────────────────────
const AppNavigator = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown:       false,
      animation:         'slide_from_right',
      animationDuration: 220,
    }}>

    <Stack.Screen name="Tabs"             component={VolunteerTabs}          />

    {/* NGO */}
    <Stack.Screen name="NgoProfile"       component={NgoProfileScreen}       />
    <Stack.Screen name="MyOrgs"           component={MyOrgsScreen}           />
    <Stack.Screen name="CreateOrg"        component={CreateOrgScreen}        />

    {/* Volunteer */}
    <Stack.Screen name="AllOpportunities" component={AllOpportunitiesScreen} />
    <Stack.Screen name="ProjectDetail"    component={ProjectDetailScreen}    />
    <Stack.Screen name="JoinForm"         component={JoinFormScreen}         />
    <Stack.Screen name="MyProjects"       component={MyProjectsScreen}       />

    {/* Profile */}
    <Stack.Screen name="EditProfile"      component={EditProfileScreen}      />

    {/* Donations */}
    <Stack.Screen name="Donate"           component={DonateScreen}           />
    <Stack.Screen name="DonationPayment"  component={DonationPaymentScreen}  />
    <Stack.Screen name="DonationSuccess"  component={DonationSuccessScreen}  />
    <Stack.Screen name="MyDonations"      component={MyDonationsScreen}      />

    {/* SOS */}
    <Stack.Screen name="SosTrigger"       component={SosTriggerScreen}       />
    <Stack.Screen name="SosActive"        component={SosActiveScreen}        />
    <Stack.Screen name="SosResolved"      component={SosResolvedScreen}      />
    <Stack.Screen name="LiveLocation"     component={LiveLocationScreen}     />

    {/* Misc */}
    <Stack.Screen name="Notifications"    component={NotificationsScreen}    />
    <Stack.Screen name="FCMTest"          component={FCMTestScreen}          />

    {/* Admin — full bottom-tab navigator, replaces single AdminDashboard screen */}
    <Stack.Screen name="AdminTabs"          component={AdminNavigator}           options={{ headerShown: false }} />
    <Stack.Screen name="AdminProjects"       component={AdminProjectsScreen}       />
    <Stack.Screen name="AdminProjectDetail" component={AdminProjectDetailScreen}  />
    <Stack.Screen name="CreateProject"      component={CreateProjectScreen}       />
    <Stack.Screen name="Participants"       component={ParticipantsScreen}        />
    <Stack.Screen name="AdminVolunteers"   component={AdminVolunteersScreen}   />
    <Stack.Screen name="AdminCommunity"    component={AdminCommunityScreen}    />
    <Stack.Screen name="AdminDonations"    component={AdminDonationsScreen}    />
    <Stack.Screen name="AdminCampaigns"    component={AdminCampaignsScreen}    />
    <Stack.Screen name="AdminDonors"       component={AdminDonorsScreen}       />
    <Stack.Screen name="AdminTransactions" component={AdminTransactionsScreen} />
    <Stack.Screen name="AdminWithdrawal"   component={AdminWithdrawalScreen}   />
    <Stack.Screen name="AdminOrg"          component={AdminOrgScreen}          />
    <Stack.Screen name="VolunteerProfile"  component={VolunteerProfileScreen}  />
    <Stack.Screen name="MemberImpact"      component={MemberImpactScreen}      />
    <Stack.Screen name="InviteMembers"     component={InviteMembersScreen}     />

    {/* Invite deep link — accessible from any part of the app */}
    <Stack.Screen name="InviteAccept"     component={InviteAcceptScreen}      />

    {/* In-app browser — for T&C, Privacy Policy, and other web content */}
    <Stack.Screen name="WebView"          component={WebViewScreen}           />

    {/* Help & Support */}
    <Stack.Screen name="HelpSupport"              component={HelpSupportScreen}              />

    {/* Communication & Notification Preferences */}
    <Stack.Screen name="CommunicationPreferences" component={CommunicationPreferencesScreen} />

    {/* Saved Posts */}
    <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />

    {/* All Badges */}
    <Stack.Screen name="AllBadges" component={AllBadgesScreen} options={{ headerShown: false }} />
  </Stack.Navigator>
);

export default AppNavigator;
