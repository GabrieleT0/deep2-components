import BaseDatalet from '../base-datalet/base-datalet.js';

class AreachartDatalet extends BaseDatalet
{
    constructor()
    {
        super('areachart-datalet');
    }

    handle_behaviour()
    {
        try {
            //{requestData:0}, {selectData:0}, {filterData:0}, {trasformData:0} -> [0, 0, 0, 0]
            this.set_behaviours(['../lib/modules/AjaxJsonAlasqlBehavior.js', '../lib/modules/HighChartsBehavior.js'], [0, 0, 0, 1]);
        } catch (e) {
            console.log("ERROR");
            console.log(e);
        }
    }

    template()
    {
        const template = this.currentDocument.querySelector('#areachart-datalet');
        return template.content.cloneNode(true);
    }

    async render(data)
    {
        console.log('RENDER - areachart-datalet');

        await this.import_module('../lib/vendors/highstock/highstock.js');
        const builder = await this.import_module('../lib/modules/HighChartsBuilder.js');

        let options = await builder.build('area', this, data);

        options.plotOptions.area = {
            dataLabels: {
                formatter: function() {
                    return this.y + ' ' + this.getAttribute("suffix");
                },
                enabled: this.getAttribute("dataLabels")
            },
            marker: {
                enabled: false,
                symbol: 'circle',
                radius: 2,
                states: {
                    hover: {
                        enabled: true
                    }
                }
            }
        };

        if(data.series[0].data.length > 20)
            Highcharts.stockChart(context.shadowRoot.querySelector('#datalet_container'), options);
        else
            Highcharts.chart(this.shadowRoot.querySelector('#datalet_container'), options);
    }
}

const FrozenAreachartDatalet = Object.freeze(AreachartDatalet);
window.customElements.define('areachart-datalet', FrozenAreachartDatalet);