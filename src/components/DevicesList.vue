<template>
  <div style="position: relative; height: 100dvh; overflow: hidden">
    <q-list dark class="bg-grey-9 text-white">
      <q-item :style="{ height: `${listHeaderHeight}px` }" style="line-height: 58px !important">
        <q-item-section avatar>
          <q-btn
            flat
            round
            small
            icon="mdi-chevron-left"
            style="margin-right: 15px"
            @click="$emit('click-hide')"
          />
        </q-item-section>
        <q-item-section>
          <q-item-label header class="text-bold text-white q-pa-none" style="font-size: 1.3rem">
            Devices
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn
            flat
            round
            small
            v-if="$q.platform.is.desktop"
            :icon="devicesListPinned ? 'mdi-pin' : 'mdi-pin-outline'"
            class="text-grey"
            :class="{ unpinned: !devicesListPinned }"
            @click="$emit('devices-list-pinned', !devicesListPinned)"
          >
            <q-tooltip v-if="devicesListPinned">Unpin devices list</q-tooltip>
            <q-tooltip v-else>Pin devices list</q-tooltip>
          </q-btn>
        </q-item-section>
      </q-item>
      <div
        :style="{ 'max-height': `${activeDevicesMaxHeight}px` }"
        style="overflow: auto"
        class="scrollable"
        ref="activeDevicesList"
      >
        <q-resize-observer @resize="onResizeActiveDevicesList" />
        <active-device
          v-for="device in classifiedDevices.active"
          class="with-separator"
          :key="device.id"
          :device="device"
          :isFollowed="selectedDeviceId === device.id && isFollowed === true"
          :isSelected="selectedDeviceId === device.id"
          @select-device="$emit('select-device', device.id)"
          @follow-selected-device="$emit('follow-selected-device', !isFollowed)"
          @remove-device-from-active-list="deviceRemovedHandler"
          @device-in-list-clicked="$emit('device-in-list-clicked')"
        />
      </div>
      <div v-if="classifiedDevices.inactive.length" style="overflow: auto">
        
        <!-- Multi-select controls for INACTIVE devices -->
        <q-item class="bg-grey-8" style="min-height: 60px">
          <q-item-section side style="min-width: 40px">
            <q-icon
              :name="multiSelectMode ? 'mdi-checkbox-multiple-marked' : 'mdi-checkbox-multiple-blank-outline'"
              :color="multiSelectMode ? 'primary' : 'grey-5'"
              size="1.2rem"
              @click="toggleMultiSelectMode"
              class="cursor-pointer"
            >
              <q-tooltip>{{ multiSelectMode ? 'Exit Multi-Select' : 'Multi-Select Mode' }}</q-tooltip>
            </q-icon>
          </q-item-section>
          
          <q-item-section>
            <q-item-label class="text-grey-4" style="font-size: 0.9rem">
              {{ multiSelectMode ? `${selectedDevicesIDs.length} devices selected` : 'Multi-select inactive devices' }}
            </q-item-label>
          </q-item-section>
          
          <template v-if="multiSelectMode">
            <q-item-section side class="text-center">
              <q-icon
                name="mdi-select-all"
                color="positive"
                size="1.1rem"
                @click="selectAllInactiveDevices"
                :class="{ 'text-grey-7': selectedDevicesIDs.length === classifiedDevices.inactive.length }"
                class="cursor-pointer"
              >
                <q-tooltip>Select All Inactive</q-tooltip>
              </q-icon>
            </q-item-section>
            
            <q-item-section side class="text-center">
              <q-icon
                name="mdi-select-off"
                color="negative"
                size="1.1rem"
                @click="clearAllSelections"
                :class="{ 'text-grey-7': selectedDevicesIDs.length === 0 }"
                class="cursor-pointer"
              >
                <q-tooltip>Clear All</q-tooltip>
              </q-icon>
            </q-item-section>
            
            <q-item-section side class="text-center">
              <q-icon
                name="mdi-plus-circle"
                color="primary"
                size="1.1rem"
                @click="addSelectedToActive"
                :class="{ 'text-grey-7': selectedDevicesIDs.length === 0 }"
                class="cursor-pointer"
              >
                <q-tooltip>Add Selected to Monitoring</q-tooltip>
              </q-icon>
            </q-item-section>
          </template>
        </q-item>
        
        <q-item :style="{ height: `${devicesFilterHeight}px!important` }" style="padding-top: 20px">
          <q-item-section>
            <div class="q-px-none">
              <q-input
                dense
                dark
                outlined
                hide-bottom-space
                v-model="filter"
                color="white"
                label="Filter"
              />
            </div>
          </q-item-section>
        </q-item>
        <q-virtual-scroll
          ref="vlist"
          class="scrollable"
          :items="filteredInactiveDevices"
          :virtual-scroll-item-size="deviceItemHeight"
          :style="{ height: `${inactiveDevicesHeight}px` }"
        >
          <template v-slot="{ item }">
            <inactive-device
              :key="item.id"
              :device="item"
              :itemHeight="deviceItemHeight"
              class="with-separator"
              @device-in-list-clicked="$emit('device-in-list-clicked')"
            />
          </template>
        </q-virtual-scroll>
      </div>
      <q-item v-else :style="{ height: `${inactiveDevicesHeight + devicesFilterHeight}px` }">
        <q-item-label header class="ellipsis text-bold" style="width: 100%; text-align: center"
          >No inactive devices left</q-item-label
        >
      </q-item>
    </q-list>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { mapState, mapActions } from 'pinia'
import { useDevicesStore } from '../stores/devices'
import ActiveDevice from './ActiveDevice.vue'
import InactiveDevice from './InactiveDevice.vue'

export default defineComponent({
  name: 'DevicesList',
  components: {
    ActiveDevice,
    InactiveDevice,
  },
  emits: [
    'click-hide',
    'devices-list-pinned',
    'device-in-list-clicked',
    'follow-selected-device',
    'select-device',
  ],
  props: ['activeDevicesIDs', 'devices', 'devicesListPinned', 'isFollowed', 'selectedDeviceId'],
  data() {
    return {
      activeDevicesHeight: 0,
      activeDevicesMaxHeight: 0,
      devicesFilterHeight: 70,
      deviceItemHeight: 71,
      filter: '',
      inactiveDevicesHeight: 0,
      itemsCount: 0,
      listHeaderHeight: 60,
      viewportHeight: 0,
    }
  },
  computed: {
    classifiedDevices() {
      /* classify all devices as active and inactive, basing on activeDevicesIDs property */
      const classifiedDevices = {
        active: [],
        inactive: [],
      }
      this.devices.forEach((device) => {
        if (this.activeDevicesIDs.includes(device.id)) {
          classifiedDevices.active.push(device)
        } else {
          classifiedDevices.inactive.push(device)
        }
      })
      return classifiedDevices
    },
    filteredInactiveDevices() {
      const filter = this.filter.toLowerCase()
      const filteredItems = this.filter
        ? this.classifiedDevices.inactive.filter((item) => {
            return (
              (item &&
                typeof item.name !== 'undefined' &&
                item.name !== null &&
                item.name.toLowerCase().indexOf(filter) >= 0) ||
              (item &&
                typeof item.id !== 'undefined' &&
                item.id !== null &&
                (item.id + '').indexOf(filter) >= 0) ||
              (item &&
                item.configuration &&
                typeof item.configuration.ident !== 'undefined' &&
                item.configuration.ident !== null &&
                item.configuration.ident.toLowerCase().indexOf(filter) >= 0)
            )
          })
        : this.classifiedDevices.inactive
      filteredItems.sort((l, r) => {
        if (!l.name) {
          return -1
        }
        if (!r.name) {
          return 1
        }
        const lName = l.name.toLowerCase()
        const rName = r.name.toLowerCase()
        if (lName < rName) {
          return -1
        } else if (lName > rName) {
          return 1
        }
        return 1
      })
      return filteredItems
    },
    ...mapState(useDevicesStore, {
      multiSelectMode: 'multiSelectMode',
      selectedDevicesIDs: 'selectedDevicesIDs',
    }),
  },
  methods: {
    ...mapActions(useDevicesStore, [
      'toggleMultiSelectMode',
      'selectAllActiveDevices', 
      'clearAllSelections',
      'toggleDeviceSelection',
      'addActiveDevice'
    ]),
    selectAllInactiveDevices() {
      // Select all inactive devices only
      const inactiveDeviceIds = this.classifiedDevices.inactive.map(device => device.id)
      this.selectedDevicesIDs.splice(0, this.selectedDevicesIDs.length, ...inactiveDeviceIds)
    },
    addSelectedToActive() {
      // Add all selected devices to active monitoring
      this.selectedDevicesIDs.forEach(deviceId => {
        if (!this.activeDevicesIDs.includes(deviceId)) {
          this.addActiveDevice(deviceId)
        }
      })
      // Clear selections after adding
      this.clearAllSelections()
    },
    deviceRemovedHandler() {
      /* device is moved from the active list to the inactive list */
      /* increase the height of inactive devices list by adding height of one list item, in order to prevent blinking */
      this.inactiveDevicesHeight = this.inactiveDevicesHeight + this.deviceItemHeight
      this.itemsCount = Math.ceil(this.inactiveDevicesHeight / this.deviceItemHeight)
    },
    onResizeActiveDevicesList(size) {
      /* the list of active devices was resized */
      /* re-calculate heights of left drawer's components */
      this.activeDevicesHeight = size.height
      this.inactiveDevicesHeight =
        this.viewportHeight -
        this.listHeaderHeight -
        this.devicesFilterHeight -
        this.activeDevicesHeight
      this.itemsCount = Math.ceil(this.inactiveDevicesHeight / this.deviceItemHeight)
      /* scroll to selected device */
      const selectedDeviceEl =
        this.$refs.activeDevicesList.getElementsByClassName('device-item__selected')[0]
      if (selectedDeviceEl) {
        selectedDeviceEl.scrollIntoView({ behavior: 'smooth' })
      }
    },
    onResizeScreen(height) {
      /* screen is resized */
      this.viewportHeight = height
      /* calculate max height of the active devices list, either to fit 10 devices, or to occupy 70% of viewport's height */
      const height70Percent = Math.ceil(height * 0.7)
      this.activeDevicesMaxHeight =
        height70Percent > this.deviceItemHeight * 10 ? this.deviceItemHeight * 10 : height70Percent
      /* re-calculate heights of left drawer's components */
      this.activeDevicesHeight = this.$refs.activeDevicesList
        ? this.$refs.activeDevicesList.clientHeight
        : 0
      this.inactiveDevicesHeight =
        this.viewportHeight -
        this.listHeaderHeight -
        this.devicesFilterHeight -
        this.activeDevicesHeight
      this.itemsCount = Math.ceil(this.inactiveDevicesHeight / this.deviceItemHeight)
    },
  },
  watch: {
    activeDevicesIDs() {
      /* force virtual list to re-render, needed because by default it sometimes doesn't render the list correctly */
      /* when device is made inactive and returned back to the list */
      if (this.$refs.vlist) {
        this.$refs.vlist.forceRender()
      }
    },
    '$q.screen.height': {
      immediate: true,
      handler(height) {
        this.onResizeScreen(height)
      },
    },
  },
})
</script>

<style lang="sass">
.unpinned
  transform: rotate(45deg)
.with-separator
  border-top: 1px solid #666
</style>
