import { defineStore } from 'pinia'
import { useMiscStore } from './misc'

const miscStore = useMiscStore()

export const useGeofencesStore = defineStore('geofences', {
  state: () => ({
    geofences: [], // geofences from Flespi
    geofencesLoaded: false,
  }),
  getters: {
    getGeofenceById: (state) => {
      return (geofenceId) => {
        const geofence = state.geofences.filter((geofence) => geofence.id === geofenceId)[0]
        return geofence ? geofence : {}
      }
    },
  },
  actions: {
    async fetchGeofences() {
      if (!this.$connector) {
        console.warn('[geofences store]: No connector available')
        return
      }
      
      miscStore.requestStart('get geofences')
      try {
        // Use the same pattern as devices store for API calls
        const response = await this.$connector.http.external.get('/gw/geofences')
        
        if (response && response.data && response.data.result) {
          miscStore.errorsCheck(response.data)
          this.geofences = response.data.result
          this.geofencesLoaded = true
          console.log('[geofences store]: Loaded', this.geofences.length, 'geofences')
          return this.geofences
        }
      } catch (error) {
        console.error('[geofences store]: Error fetching geofences:', error)
        miscStore.requestFailed(error)
      }
      return []
    },
    
    clearGeofences() {
      this.geofences = []
      this.geofencesLoaded = false
    },
  },
})

