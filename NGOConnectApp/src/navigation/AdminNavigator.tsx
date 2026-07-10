import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AppConfig from '../config/AppConfig';

import AdminDashboardScreen  from '../screens/admin/AdminDashboardScreen';
import AdminProjectsScreen   from '../screens/admin/AdminProjectsScreen';
import AdminVolunteersScreen from '../screens/admin/AdminVolunteersScreen';
import AdminCommunityScreen  from '../screens/admin/AdminCommunityScreen';
import AdminOrgScreen        from '../screens/admin/AdminOrgScreen';

const Tab = createBottomTabNavigator();
const C   = AppConfig.COLORS;

// ──────────────────────────────────────────────────────────────────────────────
// Icon components — approximate the prototype SVG bnav icons using styled Views.
// Exact SVG requires react-native-svg; these use border/border-radius tricks.
// ──────────────────────────────────────────────────────────────────────────────

/** Dashboard — house silhouette */
function IconDashboard({ color }: { color: string }) {
  return (
    <View style={ic.root}>
      {/* Roof triangle */}
      <View style={[ic.dashRoof, { borderBottomColor: color }]} />
      {/* House body */}
      <View style={[ic.dashBody, { borderColor: color }]}>
        <View style={[ic.dashDoor, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

/** Projects — folder shape */
function IconProjects({ color }: { color: string }) {
  return (
    <View style={ic.root}>
      <View style={[ic.folderTab, { backgroundColor: color }]} />
      <View style={[ic.folderBody, { borderColor: color }]} />
    </View>
  );
}

/** Volunteers — two-person shape */
function IconVolunteers({ color }: { color: string }) {
  return (
    <View style={ic.root}>
      {/* Back person */}
      <View style={[ic.personBk, { borderColor: color }]}>
        <View style={[ic.personHeadBk, { borderColor: color }]} />
      </View>
      {/* Front person */}
      <View style={[ic.personFr, { borderColor: color }]}>
        <View style={[ic.personHeadFr, { borderColor: color }]} />
      </View>
    </View>
  );
}

/** Community — chat bubble */
function IconCommunity({ color }: { color: string }) {
  return (
    <View style={ic.root}>
      <View style={[ic.bubble, { borderColor: color }]}>
        <View style={[ic.bubbleTail, { borderTopColor: color }]} />
      </View>
    </View>
  );
}

/** Org — building with windows */
function IconOrg({ color }: { color: string }) {
  return (
    <View style={ic.root}>
      <View style={[ic.building, { borderColor: color }]}>
        <View style={ic.buildingWindows}>
          <View style={[ic.win, { backgroundColor: color }]} />
          <View style={[ic.win, { backgroundColor: color }]} />
        </View>
        <View style={ic.buildingWindows}>
          <View style={[ic.win, { backgroundColor: color }]} />
          <View style={[ic.win, { backgroundColor: color }]} />
        </View>
        <View style={[ic.buildingGround, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── Icon styles — 22×22 container matching prototype 16px SVG (scaled up) ─────
const IC_SIZE = 22;
const ic = StyleSheet.create({
  root: { width: IC_SIZE, height: IC_SIZE, alignItems: 'center', justifyContent: 'center' },

  // Dashboard
  dashRoof: {
    width: 0, height: 0,
    borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  dashBody: {
    width: 12, height: 9,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderRadius: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  dashDoor: { width: 4, height: 5, borderRadius: 1 },

  // Projects
  folderTab: {
    width: 7, height: 3,
    borderTopLeftRadius: 2, borderTopRightRadius: 4,
    alignSelf: 'flex-start',
    marginLeft: 2,
  },
  folderBody: {
    width: 17, height: 11,
    borderWidth: 1.5,
    borderRadius: 3,
    marginTop: -0.5,
  },

  // Volunteers
  personFr: {
    position: 'absolute', left: 0, bottom: 0,
    width: 12, height: 7,
    borderWidth: 1.5, borderTopWidth: 0,
    borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
  },
  personHeadFr: {
    position: 'absolute', top: -13, left: 1,
    width: 9, height: 9,
    borderRadius: 4.5, borderWidth: 1.5,
  },
  personBk: {
    position: 'absolute', right: 0, bottom: 0,
    width: 10, height: 6,
    borderWidth: 1.5, borderTopWidth: 0,
    borderBottomLeftRadius: 5, borderBottomRightRadius: 5,
  },
  personHeadBk: {
    position: 'absolute', top: -11, right: 0,
    width: 8, height: 8,
    borderRadius: 4, borderWidth: 1.5,
  },

  // Community
  bubble: {
    width: 17, height: 13,
    borderWidth: 1.5,
    borderRadius: 8,
    borderBottomLeftRadius: 2,
  },
  bubbleTail: {
    position: 'absolute', bottom: -5, left: 2,
    width: 0, height: 0,
    borderLeftWidth: 4, borderRightWidth: 0, borderTopWidth: 5,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  // Org
  building: {
    width: 14, height: 16,
    borderWidth: 1.5,
    borderRadius: 1,
    alignItems: 'center',
    paddingTop: 4,
    gap: 3,
    overflow: 'visible',
  },
  buildingGround: {
    position: 'absolute', bottom: -2,
    width: 18, height: 1.5,
  },
  buildingWindows: { flexDirection: 'row', gap: 4 },
  win: { width: 3, height: 3, borderRadius: 0.5 },
});

// ── Tab icon selector ─────────────────────────────────────────────────────────
type TabName = 'Dashboard' | 'Projects' | 'Volunteers' | 'Community' | 'Org';

const ICON_MAP: Record<TabName, (color: string) => React.ReactElement> = {
  Dashboard:  (c) => <IconDashboard color={c} />,
  Projects:   (c) => <IconProjects color={c} />,
  Volunteers: (c) => <IconVolunteers color={c} />,
  Community:  (c) => <IconCommunity color={c} />,
  Org:        (c) => <IconOrg color={c} />,
};

function AdminTabIcon({ name, focused }: { name: TabName; focused: boolean }) {
  const color = focused ? C.PRIMARY : C.TEXT2;
  const render = ICON_MAP[name];
  return render ? render(color) : <Text style={{ color, fontSize: 16 }}>●</Text>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin tab navigator — 5 tabs matching prototype .bnav exactly
// orgId shared via adminStore — no per-screen param needed
// ──────────────────────────────────────────────────────────────────────────────
const AdminNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor:   C.PRIMARY,
      tabBarInactiveTintColor: C.TEXT2,
      tabBarIcon: ({ focused }) => (
        <AdminTabIcon name={route.name as TabName} focused={focused} />
      ),
      tabBarLabelStyle: {
        // matches VolunteerTabs label style
        fontSize:     9,
        fontWeight:   '600',
        marginTop:    -2,
        marginBottom: 2,
      },
      tabBarStyle: {
        // matches VolunteerTabs tabBarStyle exactly
        // Do NOT set height — React Navigation adds safe area bottom inset automatically.
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
    })}
  >
    <Tab.Screen name="Dashboard"  component={AdminDashboardScreen}  options={{ tabBarLabel: 'Dashboard'  }} />
    <Tab.Screen name="Projects"   component={AdminProjectsScreen}   options={{ tabBarLabel: 'Projects'   }} />
    <Tab.Screen name="Volunteers" component={AdminVolunteersScreen} options={{ tabBarLabel: 'Volunteers' }} />
    <Tab.Screen name="Community"  component={AdminCommunityScreen}  options={{ tabBarLabel: 'Community'  }} />
    <Tab.Screen name="Org"        component={AdminOrgScreen}        options={{ tabBarLabel: 'Org'        }} />
  </Tab.Navigator>
);

export default AdminNavigator;
