import { describe, expect, it } from 'vitest'
import { compareVehicleYears, sortVehicles } from './vehicleSorting'

describe('vehicle sorting', () => {
  it('sorts brands and models alphabetically with natural numeric order', () => {
    const sorted = sortVehicles([
      { brand: 'Toyota', model: 'Yaris 10', year: '2015-2020' },
      { brand: 'audi', model: 'A4', year: '2008-2012' },
      { brand: 'Audi', model: 'A4', year: '2001-2007' },
      { brand: 'Toyota', model: 'Yaris 2', year: '2010-2014' },
    ])
    expect(sorted.map(item => `${item.brand}/${item.model}/${item.year}`)).toEqual([
      'Audi/A4/2001-2007',
      'audi/A4/2008-2012',
      'Toyota/Yaris 2/2010-2014',
      'Toyota/Yaris 10/2015-2020',
    ])
  })

  it('sorts year ranges by their starting year', () => {
    expect(['2012-2018', '2001', '1998-2000'].sort(compareVehicleYears)).toEqual([
      '1998-2000',
      '2001',
      '2012-2018',
    ])
  })
})
